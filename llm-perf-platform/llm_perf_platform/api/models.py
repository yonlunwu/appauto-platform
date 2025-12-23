"""模型管理 API - 远程模型扫描、验证和生命周期管理"""
import logging
from llm_perf_platform.utils.logging_config import get_logger
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from llm_perf_platform.api.schemas import (
    ScanModelsRequest,
    ScanModelsResponse,
    ModelInfo,
    ValidateModelRequest,
    ValidateModelResponse,
    LaunchModelRequest,
    LaunchModelResponse,
    ModelInstanceResponse,
    StopModelResponse,
    ModelInstanceListResponse,
    HealthCheckResponse,
)
from llm_perf_platform.executor.model_scanner import (
    scan_remote_models,
    validate_remote_model,
)
from llm_perf_platform.executor.model_lifecycle import ModelLifecycleManager
from llm_perf_platform.models.db import get_session


logger = get_logger(__name__)
router = APIRouter(prefix="/models", tags=["models"])


@router.post("/scan", response_model=ScanModelsResponse)
async def scan_models(request: ScanModelsRequest):
    """扫描远程服务器上的可用模型

    扫描指定SSH服务器上的模型目录，返回可用模型列表。
    默认扫描 /mnt/data/models 目录。

    Args:
        request: 扫描请求，包含SSH配置和扫描参数

    Returns:
        模型列表和统计信息

    Raises:
        HTTPException: SSH连接失败或扫描失败时抛出
    """
    logger.info(f"Scanning models on {request.ssh_config.host}:{request.base_dir}")

    try:
        # 将 SSHConfig 转换为字典
        ssh_config_dict = request.ssh_config.model_dump()

        # 执行扫描
        models = await scan_remote_models(
            ssh_config=ssh_config_dict,
            base_dir=request.base_dir,
            include_hidden=request.include_hidden
        )

        logger.info(f"Scan returned {len(models)} models")

        # 转换为响应格式
        # models 现在已经是 ModelScanResult 列表，直接转换为 ModelInfo
        # ModelScanResult 和 ModelInfo 字段完全一致
        model_infos = [
            ModelInfo(
                name=model.name,
                path=model.path,
                size_gb=model.size_gb,
                family=model.family,
                model_type=model.model_type
            )
            for model in models
        ]

        logger.info(f"Scan complete: found {len(model_infos)} models")

        return ScanModelsResponse(
            models=model_infos,
            total=len(model_infos),
            base_dir=request.base_dir
        )

    except Exception as e:
        logger.error(f"Failed to scan models: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan models: {str(e)}"
        )


@router.post("/validate", response_model=ValidateModelResponse)
async def validate_model(request: ValidateModelRequest):
    """验证远程模型路径

    验证指定的模型路径是否存在，是否为有效的模型目录。
    检查是否包含必要的配置文件（config.json, tokenizer等）。

    Args:
        request: 验证请求，包含SSH配置和模型路径

    Returns:
        验证结果，包含路径存在性、大小、配置文件等信息

    Raises:
        HTTPException: SSH连接失败或验证失败时抛出
    """
    logger.info(f"Validating model path: {request.model_path} on {request.ssh_config.host}")

    try:
        # 将 SSHConfig 转换为字典
        ssh_config_dict = request.ssh_config.model_dump()

        # 执行验证
        validation_result = await validate_remote_model(
            ssh_config=ssh_config_dict,
            model_path=request.model_path
        )

        # validation_result 现在是 ModelValidationResult 对象
        return ValidateModelResponse(
            exists=validation_result.exists,
            is_directory=validation_result.is_directory,
            size_gb=validation_result.size_gb,
            has_config=validation_result.has_config,
            has_tokenizer=validation_result.has_tokenizer,
            path=request.model_path
        )

    except Exception as e:
        logger.error(f"Failed to validate model: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate model: {str(e)}"
        )


@router.get("/configs")
async def list_model_configs():
    """列出所有可用的模型配置

    返回本地YAML配置文件中定义的所有模型配置。
    这些配置定义了模型的启动参数、引擎支持等信息。

    Returns:
        模型配置列表
    """
    try:
        from llm_perf_platform.models import list_all_models

        configs = list_all_models()

        return {
            "configs": [
                {
                    "name": cfg.name,
                    "family": cfg.family,
                    "model_type": cfg.model_type,
                    "description": cfg.metadata.description,
                    "default_path": cfg.default_model_path,
                    "supported_engines": list(cfg.engines.keys()),
                    "supported_tp": cfg.requirements.supported_tp,
                    "min_gpu_memory_gb": cfg.requirements.min_gpu_memory_gb,
                    "recommended_gpu_memory_gb": cfg.requirements.recommended_gpu_memory_gb,
                    "defaults": {
                        "engine": cfg.defaults.engine,
                        "tp": cfg.defaults.tp,
                        "mode": cfg.defaults.mode,
                        "port": cfg.defaults.port,
                    }
                }
                for cfg in configs
            ],
            "total": len(configs)
        }

    except Exception as e:
        logger.error(f"Failed to list model configs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list model configs: {str(e)}"
        )


# ========== Model Lifecycle Management ==========


def _instance_to_response(instance) -> ModelInstanceResponse:
    """将ModelInstance转换为响应格式"""
    return ModelInstanceResponse(
        id=instance.id,
        model_name=instance.model_name,
        model_family=instance.model_family,
        model_type=instance.model_type,
        engine=instance.engine,
        tp=instance.tp,
        mode=instance.mode,
        scenario=instance.scenario,
        model_path=instance.model_path,
        host=instance.host,
        port=instance.port,
        endpoint=instance.endpoint,
        pid=instance.pid,
        status=instance.status,
        error_message=instance.error_message,
        ssh_config=instance.ssh_config,
        launch_command=instance.launch_command,
        gpu_memory_gb=instance.gpu_memory_gb,
        gpu_ids=instance.gpu_ids,
        last_health_check=instance.last_health_check,
        health_check_failures=instance.health_check_failures,
        created_at=instance.created_at,
        started_at=instance.started_at,
        stopped_at=instance.stopped_at,
        updated_at=instance.updated_at,
        created_by=instance.created_by,
        is_remote=instance.is_remote,
        is_running=instance.is_running,
        is_stopped=instance.is_stopped,
    )


@router.post("/launch", response_model=LaunchModelResponse)
async def launch_model(request: LaunchModelRequest):
    """启动模型实例

    在本地或远程服务器上启动模型实例。
    如果提供了ssh_config，则在远程服务器上启动；否则在本地启动。

    Args:
        request: 启动请求，包含模型配置和参数

    Returns:
        启动的模型实例信息

    Raises:
        HTTPException: 启动失败时抛出
    """
    logger.info(f"Launching model: {request.model_name} with engine {request.engine}")

    try:
        db_session = get_session()
        manager = ModelLifecycleManager(db_session)

        # 将 SSHConfig 转换为字典（如果提供）
        ssh_config_dict = None
        if request.ssh_config:
            ssh_config_dict = request.ssh_config.model_dump()

        # 启动模型
        instance = await manager.launch_model(
            model_name=request.model_name,
            engine=request.engine,
            tp=request.tp,
            mode=request.mode,
            scenario=request.scenario,
            model_path=request.model_path,
            host=request.host,
            port=request.port,
            ssh_config=ssh_config_dict,
            base_model_dir=request.base_model_dir,
            amaas_api_port=request.amaas_api_port,
            amaas_api_user=request.amaas_api_user,
            amaas_api_passwd=request.amaas_api_passwd,
            ft_container_name=request.ft_container_name,
            ft_conda_env=request.ft_conda_env,
        )

        return LaunchModelResponse(
            instance=_instance_to_response(instance),
            message=f"Model {request.model_name} launched successfully (ID: {instance.id})"
        )

    except ValueError as e:
        logger.error(f"Invalid configuration: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Launch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to launch model: {str(e)}")


@router.post("/instances/{instance_id}/stop", response_model=StopModelResponse)
async def stop_model(instance_id: int):
    """停止模型实例

    停止正在运行的模型实例。

    Args:
        instance_id: 模型实例ID

    Returns:
        停止操作结果

    Raises:
        HTTPException: 停止失败时抛出
    """
    logger.info(f"Stopping model instance: {instance_id}")

    try:
        db_session = get_session()
        manager = ModelLifecycleManager(db_session)

        success = await manager.stop_model(instance_id)

        if not success:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to stop model instance {instance_id}"
            )

        return StopModelResponse(
            instance_id=instance_id,
            success=True,
            message=f"Model instance {instance_id} stopped successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop model: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop model: {str(e)}"
        )


@router.get("/instances/{instance_id}", response_model=ModelInstanceResponse)
async def get_model_instance(instance_id: int):
    """获取模型实例详情

    Args:
        instance_id: 模型实例ID

    Returns:
        模型实例详情

    Raises:
        HTTPException: 实例不存在时抛出404
    """
    try:
        db_session = get_session()
        manager = ModelLifecycleManager(db_session)

        instance = manager.get_instance(instance_id)
        if not instance:
            raise HTTPException(
                status_code=404,
                detail=f"Model instance {instance_id} not found"
            )

        return _instance_to_response(instance)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get model instance: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get model instance: {str(e)}"
        )


@router.get("/instances", response_model=ModelInstanceListResponse)
async def list_model_instances(
    status: Optional[str] = Query(None, description="过滤状态"),
    model_name: Optional[str] = Query(None, description="过滤模型名称"),
    engine: Optional[str] = Query(None, description="过滤引擎"),
):
    """列出模型实例

    列出所有模型实例，支持按状态、模型名称、引擎过滤。

    Args:
        status: 过滤状态（可选）
        model_name: 过滤模型名称（可选）
        engine: 过滤引擎（可选）

    Returns:
        模型实例列表
    """
    try:
        db_session = get_session()
        manager = ModelLifecycleManager(db_session)

        instances = manager.list_instances(
            status=status,
            model_name=model_name,
            engine=engine
        )

        return ModelInstanceListResponse(
            instances=[_instance_to_response(inst) for inst in instances],
            total=len(instances)
        )

    except Exception as e:
        logger.error(f"Failed to list model instances: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list model instances: {str(e)}"
        )


@router.post("/instances/{instance_id}/health", response_model=HealthCheckResponse)
async def check_model_health(instance_id: int):
    """检查模型实例健康状态

    检查模型实例是否健康运行。

    Args:
        instance_id: 模型实例ID

    Returns:
        健康检查结果

    Raises:
        HTTPException: 实例不存在时抛出404
    """
    try:
        db_session = get_session()
        manager = ModelLifecycleManager(db_session)

        # 先检查实例是否存在
        instance = manager.get_instance(instance_id)
        if not instance:
            raise HTTPException(
                status_code=404,
                detail=f"Model instance {instance_id} not found"
            )

        # 执行健康检查
        health_result = await manager.check_health(instance_id)

        return HealthCheckResponse(
            instance_id=instance_id,
            healthy=health_result.get("healthy", False),
            endpoint=health_result.get("endpoint"),
            error=health_result.get("error")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to check model health: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check model health: {str(e)}"
        )
