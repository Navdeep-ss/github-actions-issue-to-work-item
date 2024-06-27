const fetch = require('node-fetch');
const core = require(`@actions/core`);
const github = require(`@actions/github`);
const azdev = require(`azure-devops-node-api`);
const { AzureCliCredential } = require(`@azure/identity`);

async function main() {

	let adoClient = null;

	// Connect to ADO
	try {
		let adoAuthHandler = null;

		console.log("Getting the Federated Credential token from az login");
		const credential = new AzureCliCredential();
		// Scope can be AdoAppClientID, or "'api://<API_APPLICATION_ID>/.default'"
		//const scope = "api://AzureADTokenExchange/.default";
		const scope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
		const accessToken = await credential.getToken(scope);
		if (accessToken.token) { console.log("Got token from az login"); }
		console.log("accessToken: " + JSON.stringify(accessToken));
		console.log("Token: " + accessToken.token);
		console.log("Token expiresOnTimestamp: " + accessToken.expiresOnTimestamp);
		console.log("Toke0:" + accessToken.token[0]);
		console.log("Toke1:" + accessToken.token[1]);
		console.log("Toke2:" + accessToken.token[2]);
		console.log("Toke3:" + accessToken.token[3]);
		console.log("Toke4:" + accessToken.token[4]);

		const projecturl = "https://dev.azure.com/" + core.getInput('ado_organization') + "/" + core.getInput('ado_project');
		
		// Make a REST call to the ADO API to get the list of work items
		// console.log("\nConnecting to ADO using REST API directly");
		// const apiurl = projecturl + "/_apis/wit/workitems/49701976?api-version=7.1";
		// console.log("API URL: " + apiurl);
		// const response = await fetch(apiurl, { 
		// 	method: 'GET', 
		// 	headers: {
		// 		'Authorization': 'Bearer ' + accessToken.token,
		// 		'Accept': 'application/json'
		// 	} 
		// });
		// console.log("Response status: " + response.status);
		// console.log("Response: " + JSON.stringify(response));
		// const data = await response.text();
		// console.log("Data: " + data);


		// Connect to ADO using the Azure DevOps SDK
		console.log("\nConnecting to ADO using Azure DevOps SDK");
		console.log("Using projecturl: " + projecturl);
		adoAuthHandler = azdev.getBearerHandler(accessToken.token, true);
		const adoConnection = new azdev.WebApi(projecturl, adoAuthHandler, {
			allowRedirects: true,
			ignoreSslError: true
		});

		console.log("Getting the Work Item Tracking API");
		adoClient = await adoConnection.getWorkItemTrackingApi();
		console.log("Got the Work Item Tracking API");
	} catch (e) {
		console.error(e);
		core.setFailed('Could not connect to ADO');
		return null;
	}
	return adoClient;
}

main();
