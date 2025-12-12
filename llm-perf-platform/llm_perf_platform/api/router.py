from fastapi import APIRouter

from llm_perf_platform.api.auth import router as auth_router
from llm_perf_platform.api.tests import router as tests_router
from llm_perf_platform.api.models import router as models_router
from llm_perf_platform.api.basic_tests import router as basic_tests_router
from llm_perf_platform.api.system import router as system_router


router = APIRouter()

router.include_router(tests_router)
router.include_router(auth_router)
router.include_router(models_router)
router.include_router(basic_tests_router)
router.include_router(system_router)


@router.get("/ping")
def ping():
    return {"msg": "pong"}




