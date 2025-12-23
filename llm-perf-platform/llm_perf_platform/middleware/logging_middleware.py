"""
HTTP 请求日志中间件

记录所有 HTTP 请求的详细信息，包括：
- 用户信息
- 请求方法和路径
- 请求 body
- 响应状态
- 处理时间
"""
import json
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from llm_perf_platform.utils.logging_config import get_logger, setup_access_logging

# 使用请求专用logger
access_logger = setup_access_logging()
# 保留应用logger用于错误日志
logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """记录所有 HTTP 请求的中间件"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 记录请求开始时间
        start_time = time.time()

        # 获取用户信息（从查询参数或 header 中获取，如果有的话）
        user_email = "anonymous"

        # 读取请求 body（如果有）
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                # 读取 body 并缓存
                body_bytes = await request.body()
                # 尝试解析为 JSON
                if body_bytes:
                    try:
                        body = json.loads(body_bytes.decode("utf-8"))
                        # 隐藏敏感信息
                        body = self._mask_sensitive_fields(body)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        body = f"<binary data: {len(body_bytes)} bytes>"
            except Exception as e:
                logger.warning(f"Failed to read request body: {e}")

        # 记录请求信息
        logger.info(
            f"[REQUEST] {request.method} {request.url.path} | "
            f"User: {user_email} | "
            f"Client: {request.client.host if request.client else 'unknown'}"
        )

        # 如果有 body，单独记录一行（方便查看）
        if body is not None:
            logger.info(f"[REQUEST BODY] {request.method} {request.url.path} | Body: {json.dumps(body, ensure_ascii=False)}")

        # 处理请求
        try:
            response = await call_next(request)
        except Exception as e:
            # 记录异常
            duration = time.time() - start_time
            logger.error(
                f"[RESPONSE] {request.method} {request.url.path} | "
                f"Status: 500 (Exception) | "
                f"Duration: {duration:.3f}s | "
                f"Error: {str(e)}"
            )
            raise

        # 记录响应信息
        duration = time.time() - start_time
        logger.info(
            f"[RESPONSE] {request.method} {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {duration:.3f}s"
        )

        return response

    def _mask_sensitive_fields(self, data: dict) -> dict:
        """隐藏敏感字段（如密码）"""
        if not isinstance(data, dict):
            return data

        masked = data.copy()
        sensitive_fields = {"password", "passwd", "api_passwd", "ssh_password", "auth_password"}

        for key in masked:
            if key.lower() in sensitive_fields:
                masked[key] = "***MASKED***"
            elif isinstance(masked[key], dict):
                masked[key] = self._mask_sensitive_fields(masked[key])

        return masked
