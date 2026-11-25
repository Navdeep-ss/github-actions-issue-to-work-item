import fetch from 'node-fetch';
import * as core from '@actions/core';

const SYNC_FUNCTION_URL = process.env.ado_sync_function_url;
if (!SYNC_FUNCTION_URL) {
    throw new Error("Missing required environment variable 'ado_sync_function_url'. Pass it from repository secrets.");
}

const oidcToken = await getGitHubOidcToken();

async function getGitHubOidcToken() {
    if (process.env.ADO_SYNC_BEARER_TOKEN) {
        return process.env.ADO_SYNC_BEARER_TOKEN;
    }
    const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!reqUrl || !reqToken) {
        throw new Error("Missing ACTIONS_ID_TOKEN_REQUEST_URL or ACTIONS_ID_TOKEN_REQUEST_TOKEN. Ensure workflow has 'permissions: id-token: write'.");
    }
    const sep = reqUrl.includes('?') ? '&' : '?';
    const url = `${reqUrl}${sep}audience=ado-issue-sync`;
    console.log("Requesting GitHub OIDC token for ADO sync endpoint");
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${reqToken}`,
            'Accept': 'application/json; api-version=2.0',
            'Content-Type': 'application/json'
        }
    });
    const data = await response.json();
    if (!response.ok || !data.value) {
        throw new Error(`Failed to get GitHub OIDC token (${response.status}): ${JSON.stringify(data)}`);
    }
    console.log("Got GitHub OIDC token");
    return data.value;
}

async function callSyncFunction(payload) {
    const response = await fetch(SYNC_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + oidcToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...payload,
            ado_organization: core.getInput('ado_organization') || 'microsoft',
            ado_project: core.getInput('ado_project') || 'Edge'
        })
    });
    const rawText = await response.text();
    let json = null;
    try {
        json = JSON.parse(rawText);
    } catch {
        json = { message: rawText.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, json };
}

function formatError(op, status, statusText, json) {
    const detail = json?.error || json?.message || statusText || 'Unknown error';
    return `ADO ${op} failed with HTTP ${status}: ${detail}`;
}

export async function queryByWiql(query) {
    console.log("\nStarting REST call to ADO wiql API");
    console.log("Wiql Query: " + JSON.stringify(query));
    const { ok, status, statusText, json } = await callSyncFunction({ op: 'queryByWiql', query });
    console.log("Query result: " + JSON.stringify(json));
    if (!ok) {
        throw new Error(formatError('queryByWiql', status, statusText, json));
    }
    return json;
}

export async function getWorkItem(adoId) {
    console.log("\nStarting REST call to ADO workitems API: GET");
    const { ok, status, statusText, json } = await callSyncFunction({ op: 'getWorkItem', adoId });
    console.log("getWorkItem result: " + JSON.stringify(json));
    if (!ok) {
        const msg = formatError('getWorkItem', status, statusText, json);
        console.log("Error: " + msg);
        core.setFailed(msg);
        return null;
    }
    return json;
}

export async function updateWorkItem(adoId, fields) {
    console.log("\nStarting REST call to ADO workitems API: PATCH");
    const { ok, status, statusText, json } = await callSyncFunction({ op: 'updateWorkItem', adoId, fields });
    console.log("updateWorkItem result: " + JSON.stringify(json));
    if (!ok) {
        const msg = formatError('updateWorkItem', status, statusText, json);
        console.log("Error: " + msg);
        core.setFailed(msg);
        return null;
    }
    return json;
}

export async function createWorkItem(workItemType, fields) {
    console.log("\nStarting REST call to ADO workitems API: POST");
    const { ok, status, statusText, json } = await callSyncFunction({ op: 'createWorkItem', workItemType, fields });
    console.log("createWorkItem result: " + JSON.stringify(json));
    if (!ok) {
        const msg = formatError('createWorkItem', status, statusText, json);
        console.log("Error: " + msg);
        core.setFailed(msg);
        return null;
    }
    return json;
}
