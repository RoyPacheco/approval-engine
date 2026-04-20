from fastapi import APIRouter, HTTPException
from ..config import settings
from ..storage.json_store import read_list, write_list

router = APIRouter()
STORE = settings.data_dir / "workflows.json"


@router.get("", response_model=list[dict])
def list_workflows():
    return read_list(STORE)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str):
    wf = next((w for w in read_list(STORE) if w.get("id") == workflow_id), None)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.put("/{workflow_id}", status_code=200)
def upsert_workflow(workflow_id: str, workflow: dict):
    workflow["id"] = workflow_id
    workflows = read_list(STORE)
    idx = next((i for i, w in enumerate(workflows) if w.get("id") == workflow_id), None)
    if idx is not None:
        workflows[idx] = workflow
    else:
        workflows.append(workflow)
    write_list(STORE, workflows)
    return workflow


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str):
    workflows = read_list(STORE)
    filtered = [w for w in workflows if w.get("id") != workflow_id]
    if len(filtered) == len(workflows):
        raise HTTPException(404, "Workflow not found")
    write_list(STORE, filtered)
