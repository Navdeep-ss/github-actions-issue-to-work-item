const fetch = require('node-fetch');
const core = require(`@actions/core`);
const { AzureCliCredential } = require(`@azure/identity`);

async function initToken() {
    // Get the Federated Credential token from az login
    console.log("Getting the Federated Credential token from az login");
    const credential = new AzureCliCredential();
    const scope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
    const accessToken = await credential.getToken(scope);
    if (accessToken.token) {
        console.log("Got token from az login");
        return accessToken.token;
    }
    throw new Error("Could not get token from az login");
}

export async function queryByWiql(query) {
    // Make REST call to ADO wiql API
    console.log("\nStarting REST call to ADO wiql API");
    const apiurl = projecturl + "/_apis/wit/wiql?api-version=7.1";
    const response = await fetch(apiurl, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: query
    });
	const json = await response.json();
	console.log("Query result: " + JSON.stringify(json));
    return json;
}

export async function getWorkItem(adoId) {
	// Make REST call to ADO workitems API
	console.log("\nStarting REST call to ADO workitems API: GET");
	const apiurl = projecturl + "/_apis/wit/workitems/" + adoId + "?api-version=7.1";
	const response = await fetch(apiurl, {
		method: 'GET',
		headers: {
			'Authorization': 'Bearer ' + token
		}
	});
	const json = await response.json();
	console.log("getWorkItem result: " + JSON.stringify(json));
	return json;
}

export async function updateWorkItem(adoId, fields) {
	// Make REST call to ADO workitems API
	console.log("\nStarting REST call to ADO workitems API: PATCH");
	const apiurl = projecturl + "/_apis/wit/workitems/" + adoId + "?api-version=7.1";
	const response = await fetch(apiurl, {
		method: 'PATCH',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json-patch+json'
		},
		body: fields
	});
	const json = await response.json();
	console.log("updateWorkItem result: " + JSON.stringify(json));
	return json;
}

export async function createWorkItem(workItemType, fields) {
	// Make REST call to ADO workitems API
	console.log("\nStarting REST call to ADO workitems API: POST");
	const apiurl = projecturl + "/_apis/wit/workitems/$" + workItemType + "?api-version=7.1";
	const response = await fetch(apiurl, {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json'
		},
		body: fields
	});
	const json = await response.json();
	console.log("createWorkItem result: " + JSON.stringify(json));
	return json;
}


const token = await initToken();

const ado_organization = core.getInput('ado_organization');
const ado_project = core.getInput('ado_project');
const projecturl = "https://dev.azure.com/" + ado_organization + "/" + ado_project;
