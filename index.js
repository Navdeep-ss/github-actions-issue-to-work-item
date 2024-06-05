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
		const accessToken = await credential.getToken("api://AzureADTokenExchange/.default");
		if (accessToken.token) { console.log("Got token from az login"); }

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
		adoAuthHandler = azdev.getBearerHandler(accessToken.token, true);
		const adoConnection = new azdev.WebApi(projecturl, adoAuthHandler);

		console.log("Getting the Work Item Tracking API");
		adoClient = await adoConnection.getWorkItemTrackingApi();
	} catch (e) {
		console.error(e);
		core.setFailed('Could not connect to ADO');
		return null;
	}
	return adoClient;
}

main();
