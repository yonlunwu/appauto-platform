from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, EmailStr, Field

from llm_perf_platform.services.task_service_v2 import TaskService

task_service = TaskService()


class DeployRequestBase(BaseModel):
    ip: str
    tar_name: str
    ssh_user: str
    ssh_password: str
    ssh_port: int
    user: str
    appauto_branch: str

class DeployAMaaSRequest(DeployRequestBase):
    deploy_type: Literal["amaas"] = "amaas"
    tag: str  # AMaaS 特有

class DeployFTRequest(DeployRequestBase):
    deploy_type: Literal["ft"] = "ft"
    # FT 没有 tag 字段

class BasePayload(BaseModel):
    """所有 Payload 的基类"""
    task_id: int
    task_type: str

    class Config:
        # 允许额外字段以保持向后兼容
        extra = "allow"

class EnvDeployPayload(BasePayload):
    user: str
    
    appauto_branch: str
    
    task_id: int
    task_type: str = "env_deploy"
    deploy_type: Literal["amaas", "ft"]
    
    ip: str
    ssh_user: str = "qujing"
    ssh_password: str = "qujing@$#21"
    ssh_port: int = 22

    tag: Optional[str] = None
    tar_name: Optional[str] = None
    
    # FT 特有参数
    image: Optional[str] = None
    
    @classmethod
    def from_task_record(
        cls, 
        record: "TaskRecord",  # 假设的任务记录类型
        request: DeployRequest
    ) -> "EnvDeployPayload":
        """工厂方法：从任务记录和原始请求构建 Payload"""
        return cls(
            task_id=record.id,
            task_type="env_deploy",
            deploy_type=request.deploy_type,
            # 直接从 request 委托属性
            **request.model_dump(include={
                "ip", "tar_name", "ssh_user", "ssh_port", 
                "user", "appauto_branch", "tag"
            }, exclude_none=True)
        )

# 使用变得极简
def _run_deploy(deploy_type: str, request: DeployRequest, current_user) -> DeployResponse:
    # 构建参数时直接展开
    record = task_service.create_task(
        parameters={
            **request.model_dump(exclude_none=True),
            "task_type": "env_deploy",
        },
        # ... 其他参数
    )
    
    # 一行构建 Payload
    payload = EnvDeployPayload.from_task_record(record, request)
    
    task_scheduler.submit(record.id, payload)
    return DeployResponse(...)



def _run_deploy(deploy_type: Literal["amaas", "ft"],):
    task_service.create_task(
        engine="appauto",
        
    )
    
def _run_deploy(deploy_type: str, request: DeployRequest, current_user) -> DeployResponse:
    record = task_service.create_task(
        engine="appauto",
        model=f"{deploy_type}_deploy",
        parameters=request,  # ← 直接传 BaseModel
        status="queued",
        user_id=current_user.id,
        appauto_branch=request.appauto_branch,
        task_type="env_deploy",
    )

    # 构造 Payload 也更简洁
    payload = EnvDeployPayload(
        **request.model_dump(exclude_none=True),
        task_id=record.id,
        task_type="env_deploy",
    )
    
    task_scheduler.submit(record.id, payload)  # ← 明确传 Model
    
    return DeployResponse(...)

