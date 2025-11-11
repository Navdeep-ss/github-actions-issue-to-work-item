import * as core from '@actions/core';

// Mock in-memory storage for work items
const mockWorkItems = new Map();
let nextWorkItemId = 1000;

const ado_organization = core.getInput('ado_organization') || 'mock-org';
const ado_project = core.getInput('ado_project') || 'mock-project';
const projectUrl = "https://dev.azure.com/" + ado_organization + "/" + ado_project;

console.log("⚠️  MOCK MODE: Using mock ADO implementation (no Azure access required)");

export async function queryByWiql(query) {
    console.log("\n[MOCK] Simulating REST call to ADO wiql API");
    console.log("[MOCK] Wiql Query: " + JSON.stringify(query));
    
    // Parse the query to extract the GitHub issue number from the title search
    const queryString = query.query;
    const match = queryString.match(/\[System\.Title\] CONTAINS '(\d+)'/);
    const ghIssueNumber = match ? match[1] : null;
    
    // Search for matching work items in our mock storage
    const matchingItems = [];
    for (const [id, item] of mockWorkItems.entries()) {
        if (ghIssueNumber && item.fields['System.Title'].includes(`GitHub #${ghIssueNumber}`)) {
            matchingItems.push({ id, url: `${projectUrl}/_apis/wit/workitems/${id}` });
        }
    }
    
    const result = {
        queryType: "flat",
        queryResultType: "workItem",
        asOf: new Date().toISOString(),
        workItems: matchingItems
    };
    
    console.log("[MOCK] Query result: " + JSON.stringify(result));
    return result;
}

export async function getWorkItem(adoId) {
    console.log("\n[MOCK] Simulating REST call to ADO workitems API: GET");
    console.log(`[MOCK] Getting work item ${adoId}`);
    
    const workItem = mockWorkItems.get(parseInt(adoId));
    
    if (!workItem) {
        console.log("[MOCK] Work item not found");
        return null;
    }
    
    console.log("[MOCK] getWorkItem result: " + JSON.stringify(workItem));
    return workItem;
}

export async function updateWorkItem(adoId, fields) {
    console.log("\n[MOCK] Simulating REST call to ADO workitems API: PATCH");
    console.log(`[MOCK] Updating work item ${adoId}`);
    console.log("[MOCK] Update fields: " + JSON.stringify(fields));
    
    const workItem = mockWorkItems.get(parseInt(adoId));
    
    if (!workItem) {
        console.log("[MOCK] Work item not found");
        return null;
    }
    
    // Apply patch operations
    for (const operation of fields) {
        if (operation.op === "replace" || operation.op === "add") {
            const fieldPath = operation.path.replace("/fields/", "");
            workItem.fields[fieldPath] = operation.value;
        }
    }
    
    workItem.rev++;
    
    console.log("[MOCK] updateWorkItem result: " + JSON.stringify(workItem));
    return workItem;
}

export async function createWorkItem(workItemType, fields) {
    console.log("\n[MOCK] Simulating REST call to ADO workitems API: POST");
    console.log(`[MOCK] Creating work item type: ${workItemType}`);
    console.log("[MOCK] Fields: " + JSON.stringify(fields));
    
    const workItemId = nextWorkItemId++;
    
    const workItem = {
        id: workItemId,
        rev: 1,
        fields: {
            "System.Id": workItemId,
            "System.WorkItemType": workItemType,
            "System.State": "New",
            "System.Reason": "New",
            "System.CreatedDate": new Date().toISOString(),
            "System.ChangedDate": new Date().toISOString(),
            "System.TeamProject": ado_project
        },
        relations: [],
        url: `${projectUrl}/_apis/wit/workitems/${workItemId}`
    };
    
    // Apply patch operations
    for (const operation of fields) {
        if (operation.path.startsWith("/fields/")) {
            const fieldPath = operation.path.replace("/fields/", "");
            workItem.fields[fieldPath] = operation.value;
        } else if (operation.path === "/relations/-") {
            workItem.relations.push(operation.value);
        }
    }
    
    // Store the work item
    mockWorkItems.set(workItemId, workItem);
    
    console.log("[MOCK] createWorkItem result: " + JSON.stringify(workItem));
    console.log(`[MOCK] ✅ Created mock work item with ID: ${workItemId}`);
    
    return workItem;
}
