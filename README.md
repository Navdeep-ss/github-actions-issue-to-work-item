# Sync GitHub Issue to Azure DevOps Work Item

Creates and updates Azure DevOps (ADO) work items for GitHub issues matching a configured label (`tracked`, `regression`, etc.), and syncs closed/reopened state via an ADO tag.

## How authentication works

This action does **not** use an ADO Personal Access Token or `azure/login`.

1. The workflow requests a short-lived GitHub OIDC JWT (`audience=ado-issue-sync`) using `permissions: id-token: write`.
2. The action sends ADO work item operations (`queryByWiql`, `getWorkItem`, `updateWorkItem`, `createWorkItem`) to the endpoint configured in the `ado_sync_function_url` environment variable (stored as a GitHub repository secret) with `Authorization: Bearer <oidc-jwt>`.
3. The backend Azure Function validates the function key and cryptographically verifies the GitHub OIDC JWT before authenticating to ADO via Managed Identity.

## Supported issue events

* `labeled`: Creates an ADO work item if the applied label matches `label` and no existing item is found.
* `opened` / `edited`: Fetches live labels from the GitHub API and creates an ADO work item if `label` is present.
* `closed` / `reopened`: If the issue body contains an `AB#<id>` link, adds or removes `ado_gh_closed_tag` on the ADO work item.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `label` | Yes | - | Label that triggers syncing the issue to ADO (e.g. `tracked`, `regression`). |
| `ado_organization` | Yes | - | ADO organization name (e.g. `microsoft`). |
| `ado_project` | Yes | - | ADO project name (e.g. `Edge`). |
| `ado_area_path` | Yes | - | Area path under which the work item is created. |
| `ado_tags` | No | `""` | Semicolon-separated tags to add to newly created work items. |
| `ado_gh_closed_tag` | No | `GitHub_Closed` | Tag added/removed when the GitHub issue is closed/reopened. |
| `parent_work_item` | No | `""` | Optional parent work item ID to link under. |
| `update_issue_body` | No | `'true'` | Whether to append `[AB#<id>]` to the GitHub issue body after creating/finding the work item. |

## Outputs

* `id`: The ID of the created ADO work item.

## Environment variables

* `github_token` (**required**): `${{ secrets.GITHUB_TOKEN }}`
* `ado_sync_function_url` (**required**): `${{ secrets.ADO_SYNC_FUNCTION_URL }}`

## Example usage

```yaml
name: Sync ADO Issue

on:
  issues:
    types: [labeled, closed, reopened]

permissions:
  id-token: write
  contents: read
  issues: write

jobs:
  alert:
    runs-on: windows-latest
    steps:
      - name: Sync tracked bugs to ADO
        uses: Navdeep-ss/github-actions-issue-to-work-item@master
        env:
          github_token: "${{ secrets.GITHUB_TOKEN }}"
          ado_sync_function_url: "${{ secrets.ADO_SYNC_FUNCTION_URL }}"
        with:
          label: 'tracked'
          ado_organization: 'microsoft'
          ado_project: 'Edge'
          ado_area_path: 'Edge\Web Experience\WebView2'
          ado_tags: 'WV2_GitHub'
          ado_gh_closed_tag: 'WV2_GitHub_Closed'
```
