const core = require(`@actions/core`);
const github = require(`@actions/github`);
const azdev = require(`azure-devops-node-api`);
const { AzureCliCredential } = require(`@azure/identity`);

async function main() {

	let adoClient = null;

	// Connect to ADO
	try {
		let adoAuthHandler = null;

		// Otherwise, assume that the Azure CLI has already authenticated using
		// `az login`.
		const credential = new AzureCliCredential();
		// Scope can be AdoAppClientID, or "'api://<API_APPLICATION_ID>/.default'"
		const accessToken = await credential.getToken("hiya");
		if (accessToken.token) { console.log("Got ADO token"); }
		adoAuthHandler = azdev.getBearerHandler(accessToken.token, true);

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

main();
