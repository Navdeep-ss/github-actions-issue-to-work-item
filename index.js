const core = require(`@actions/core`);
const github = require(`@actions/github`);
const azdev = require(`azure-devops-node-api`);
const { AzureCliCredential } = require(`@azure/identity`);

async function main() {
	const payload = github.context.payload;

	console.log("Running ADO Creation workflow for payload: " + JSON.stringify(payload));

	// If not the correct labelling, quit
	if (payload.action === 'labeled') {
		await handleLabeled(payload);
	} else if (payload.action === 'closed' || payload.action === 'reopened') {
		await handleIssue(payload);
	} else {
		console.log(`Action was not expected for payload.action = ${payload.action}. Nothing to do. Exiting.`);
		return;
	}
}

async function handleIssue(payload) {

	let adoClient = await connectToAdo();
	if (!adoClient) { return; }

	let adoIdFromIssue = await findAdoIdFromIssue(payload.issue.body);
	if (adoIdFromIssue == -1) {
		console.log("No corresponding ADO id found in GitHub issue body.");
		console.log("Exiting.");
		return;
	} else {
		console.log("Found existing ADO id in GitHub issue body: " + adoIdFromIssue);
	}

	let adoWorkItem = await adoClient.getWorkItem(adoIdFromIssue);
	if (!adoWorkItem) {
		console.log("Couldn't get ADO work item with id: " + adoIdFromIssue);
		core.setFailed();
		return;
	}

	// Get the current tags from the work item
	let tags = adoWorkItem.fields["System.Tags"] ?? [];
	let closed_tag = core.getInput("ado_gh_closed_tag") ?? "GitHub_Closed";
	console.log("Closed tag: " + closed_tag);

	if (payload.action === 'reopened') {
		// Remove the 'WV2_Closed' tag
		console.log("Issue was reopened. Removing the " + closed_tag + " tag.");
		tags = tags.replace(closed_tag, '');
	} else if (payload.action === 'closed') {
		// Add the 'WV2_Closed' tag
		if (!tags.includes(closed_tag)) {
			console.log("Issue was closed. Adding the " + closed_tag + " tag.");
			tags = tags + ';' + closed_tag;
		} else {
			console.log("Issue was closed, but the " + closed_tag + " tag was already present. Nothing to do.");
			return;
		}
	} else {
		console.log(`Action was not expected for payload.action = ${payload.action}. Nothing to do. Exiting.`);
		core.setFailed();
		return;
	}

	const patchDocument = [
		{
			op: "replace", // 'add' patch operation on an existing work item field replaces the value
			path: "/fields/System.Tags",
			value: tags,
		}
	];

	console.log("Updating tags on ADO work item with tags: " + tags);
	let updateResult = await adoClient.updateWorkItem(
		(customHeaders = []),
		(document = patchDocument),
		(id = adoIdFromIssue),
		(project = core.getInput('ado_project')),
		(validateOnly = false),
		(bypassRules = false)
	);
	if (!updateResult) {
		console.log("Couldn't update ADO work item with id: " + adoIdFromIssue);
		core.setFailed();
		return;
	}
}

async function handleLabeled(payload) {
	// We will only handle labeled events if the label matches the 'label' input filter.
	if (payload.label.name !== core.getInput('label')) {
		console.log(`Action was 'labeled' but label was not in filter = ${core.getInput('label')}. Nothing to do.`);
		return;
	}

	// Look for existing ADO id in issue body
	let adoIdFromIssue = await findAdoIdFromIssue(payload.issue.body);
	if (adoIdFromIssue != -1) {
		console.log("Found existing ADO id in GitHub issue body: " + adoIdFromIssue);
		console.log("Won't try to create a new item.");
		return;
	}

	let adoClient = await connectToAdo();
	if (!adoClient) { return; }

	try {
		// Search for an existing ADO item with "GitHub #<id>" in the title
		console.log("Check to see if work item already exists");
		let adoId = await findAdoIdFromAdo(payload.issue.number, adoClient);
		if (adoId === -1) {
			console.log("Could not find existing ADO workitem, creating one now");
		} else {
			console.log("Found existing ADO workitem: " + adoId + ". No need to create a new one");
			
			// Update the GitHub issue body with the workitem id if it wasn't already there
			if (adoIdFromIssue == -1) {
				updateIssueBody(payload, adoId);
			}
			return;
		}

		// Try to create a new ADO item
		let workItem = await create(payload, adoClient);

		// Success!
		if (workItem != null || workItem != undefined) {
			console.log(`Work item successfully created or found: ${workItem.id}`);

			// Update the GitHub issue body with the workitem id
			if (adoIdFromIssue == -1) {
				updateIssueBody(payload, workItem.id);
			}

			// Set output message
			core.setOutput(`id`, `${workItem.id}`);
		}
	} catch (error) {
		console.log("Error: " + error);
		core.setFailed();
	}
}

async function connectToAdo() {
	let adoClient = null;

	// Connect to ADO
	try {
		let adoAuthHandler = null;

		// Otherwise, assume that the Azure CLI has already authenticated using
		// `az login`.
		//const credential = new AzureCliCredential();
		// Scope can be AdoAppClientID, or "'api://<API_APPLICATION_ID>/.default'"
		//const accessToken = await credential.getToken("api://AzureADTokenExchange");
		//adoAuthHandler = azdev.getBearerHandler(accessToken.token);

		// TODO: Add fallback here to use PAT if available.
		// Use Personal Access Token (PAT) for authentication if set
		if (process.env.ado_token) {
			adoAuthHandler = azdev.getPersonalAccessTokenHandler(process.env.ado_token);
		}

		const orgUrl = "https://dev.azure.com/" + core.getInput('ado_organization');
		const adoConnection = new azdev.WebApi(orgUrl, adoAuthHandler);
		adoClient = await adoConnection.getWorkItemTrackingApi();
	} catch (e) {
		console.error(e);
		core.setFailed('Could not connect to ADO');
		return null;
	}
	return adoClient;
}

function formatTitle(githubIssue) {
	return "[GitHub #" + githubIssue.number + "] " + githubIssue.title;
}

async function formatDescription(payload) {
	console.log('Creating a description based on the github issue');
	const octokit = new github.GitHub(process.env.github_token);
	const bodyWithMarkdown = await octokit.markdown.render({
		text: payload.issue.body,
		mode: 'gfm',
		context: payload.repository.full_name
	});

	return '________________________________________________________<br>' +
		'<em>This item was auto-opened from GitHub <a href="' +
		payload.issue.html_url +
		'" target="_new">issue #' +
		payload.issue.number +
		"</a></em><br>" +
		"It won't auto-update when the GitHub issue changes so please check the issue for updates.<br><br>" +
		"<strong>Initial description from GitHub (check issue for more info):</strong><br><br>" +
		bodyWithMarkdown.data;
}

async function create(payload, adoClient) {
	const botMessage = await formatDescription(payload);
	const shortRepoName = payload.repository.full_name.split("/")[1];
	let tags = core.getInput("ado_tags") ? core.getInput("ado_tags") + ";" + shortRepoName : shortRepoName;
	const isFeature = payload.issue.labels.some((label) => label.name === 'enhancement' || label.name === 'feature' || label.name === 'feature request');
	let title = formatTitle(payload.issue);
	let priority = null;
	
	// If this was tagged as a privacy issue, add the "WV2_Privacy" tag and mark it as a Priority 0 bug.
	const isPrivacy = payload.issue.labels.some((label) => label.name === 'privacy');
	if (isPrivacy) {
		tags += ";WV2_Privacy";
		title = "[Privacy]" + title;
		priority = 0;
	}

	// If this was tagged as a regression issue, add the "WV2_Regression" tag and mark it as a Priority 0 bug.
	const isRegression = payload.issue.labels.some((label) => label.name === 'regression');
	if (isRegression) {
		tags += ";WV2_Regression";
		title = "[Regression]" + title;
		priority = 0;
	}

	console.log(`Starting to create work item for GitHub issue #${payload.issue.number}`);

	const patchDocument = [
		{
			op: "add",
			path: "/fields/System.Title",
			value: title,
		},
		{
			op: "add",
			path: "/fields/System.Description",
			value: botMessage,
		},
		{
			op: "add",
			path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
			value: botMessage,
		},
		{
			op: "add",
			path: "/fields/System.Tags",
			value: tags,
		},
		{
			op: "add",
			path: "/relations/-",
			value: {
				rel: "Hyperlink",
				url: payload.issue.html_url,
			},
		},
		{
			// Add this to avoid false positives in secret scanning from the
			// way image links are created in GH.
			op: "add",
			path: "/fields/System.History",
			value: "**BYPASS_SECRET_SCANNING**"
		 }
	];

	if (core.getInput('parent_work_item')) {
		let parentUrl = "https://dev.azure.com/" + core.getInput('ado_organization');
		parentUrl += '/_workitems/edit/' + core.getInput('parent_work_item');

		patchDocument.push({
			op: "add",
			path: "/relations/-",
			value: {
				rel: "System.LinkTypes.Hierarchy-Reverse",
				url: parentUrl,
				attributes: {
					comment: ""
				}
			}
		});
	}

	if (priority != null) {
		patchDocument.push({
			op: "add",
			path: "/fields/Microsoft.VSTS.Common.Priority",
			value: priority,
		});
	}

	patchDocument.push({
		op: "add",
		path: "/fields/System.AreaPath",
		value: core.getInput('ado_area_path'),
	});

	let workItemSaveResult = null;

	try {
		console.log('Creating work item');
		workItemSaveResult = await adoClient.createWorkItem(
			(customHeaders = []),
			(document = patchDocument),
			(project = core.getInput('ado_project')),
			(type = isFeature ? 'Scenario' : 'Bug'),
			(validateOnly = false),
			(bypassRules = false)
		);

		// if result is null, save did not complete correctly
		if (workItemSaveResult == null) {
			workItemSaveResult = -1;

			console.log("Error: createWorkItem failed");
			console.log(`WIT may not be correct: ${wit}`);
			core.setFailed();
		} else {
			console.log("Work item successfully created");
		}
	} catch (error) {
		workItemSaveResult = -1;

		console.log("Error: createWorkItem failed");
		console.log(patchDocument);
		console.log(error);
		core.setFailed(error);
	}

	if (workItemSaveResult != -1) {
		console.log(workItemSaveResult);
	}

	return workItemSaveResult;
}

async function findAdoIdFromAdo(ghIssueId, adoClient) {
	console.log('Connecting to Azure DevOps to find work item for issue #' + ghIssueId);

	const wiql = {
		query:
			`SELECT [System.Id] FROM workitems 
			WHERE
				[System.TeamProject] = @project AND
				[System.AreaPath] = '${core.getInput('ado_area_path')}' AND
				[System.Title] CONTAINS 'GitHub #' AND
				[System.Title] CONTAINS '${ghIssueId}'`
	};
	console.log("ADO query: " + wiql.query);

	let queryResult = null;
	try {
		queryResult = await adoClient.queryByWiql(wiql, { project: core.getInput('ado_project') });

		// if query results = null then i think we have issue with the project name
		if (queryResult == null) {
			console.log("Error: Project name appears to be invalid");
			core.setFailed("Error: Project name appears to be invalid");
			return -1;
		}
	} catch (error) {
		console.log("Error: queryByWiql failure");
		console.log(error);
		core.setFailed(error);
		return -1;
	}
	console.log("Query result: " + queryResult);

	console.log("Use the first item found");
	const workItem = queryResult.workItems.length > 0 ? queryResult.workItems[0] : null;

	if (workItem != null) {
		console.log("Workitem data retrieved: " + workItem.id);
		return workItem.id;
	} else {
		console.log("No workitem found for this GitHub issue, return -1");
		return -1;
	}
}

/**
 * Given a GitHub issue, return the ADO work item id that corresponds to it, or -1 if not found.
 * 
 * @param {string} issueBody the GitHub issue body.
 * @returns {number} The corresponding ADO work item id, if any was found, or -1.
 */
 async function findAdoIdFromIssue(issueBody) {
    // We expect our GitHub issues to contain the ADO number in the issue body.
    // The ADO number should be in the format "AB#12345".
    // The logic below will extract the last instance of this format in the issue body.

	console.log("Looking for ADO link in issue body");
	if (!issueBody) {
		console.log("No issue body found.");
		return -1;
	}
    const matches = issueBody.matchAll(/AB#([0-9]+)/g);
    const lastRef = [...matches].pop();
    if (!lastRef) {
        console.log("No ADO link found in issue body.");
        return -1;
    }
    
    return lastRef[1];
}

// Update the GH issue body to include the AB# so that we link the Work Item to the Issue.
// This should only get called when the issue is created.
async function updateIssueBody(payload, adoId) {

	const octokit = new github.GitHub(process.env.github_token);
	
	let issueBody = payload.issue.body + "\r\n\r\nAB#" + adoId;

	console.log("Adding 'AB#<id>' link to the issue body");
	try {
		var result = await octokit.issues.update({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			issue_number: payload.issue.number,
			body: issueBody,
		});

		return result;
	} catch (error) {
		console.log("Error: failed to update issue");
		core.setFailed(error);
	}

	return null;
}

main();
