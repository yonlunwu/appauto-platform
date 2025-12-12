"""
Virtual environment manager for multiple appauto versions.

This module manages separate virtual environments for different appauto branches,
allowing concurrent tasks to use different versions without conflicts.
"""
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Base directory for all appauto venvs
# Default to ~/.local/share/llm-perf/venvs for cross-platform compatibility
VENV_BASE_DIR = Path(os.getenv("LLM_PERF_VENV_DIR", str(Path.home() / ".local/share/llm-perf/venvs")))

# Default appauto source path (can be overridden by environment variable)
APPAUTO_SOURCE_PATH = Path(os.getenv("APPAUTO_SOURCE_PATH", str(Path.home() / "work/approaching/code/appauto")))


class VenvManager:
    """Manager for appauto virtual environments."""

    def __init__(self, base_dir: Optional[Path] = None, appauto_source: Optional[Path] = None):
        """
        Initialize venv manager.

        Args:
            base_dir: Base directory for venvs (default: VENV_BASE_DIR)
            appauto_source: Path to appauto source code (default: APPAUTO_SOURCE_PATH)
        """
        self.base_dir = base_dir or VENV_BASE_DIR
        self.appauto_source = appauto_source or APPAUTO_SOURCE_PATH
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_venv_path(self, branch: str) -> Path:
        """Get the venv directory path for a specific branch."""
        # Sanitize branch name for filesystem
        safe_branch = branch.replace("/", "_").replace("\\", "_")
        return self.base_dir / f"appauto-{safe_branch}"

    def get_appauto_bin_path(self, branch: str) -> Path:
        """Get the appauto binary path for a specific branch."""
        venv_path = self.get_venv_path(branch)
        return venv_path / ".venv" / "bin" / "appauto"

    def venv_exists(self, branch: str) -> bool:
        """Check if venv exists for a branch."""
        appauto_bin = self.get_appauto_bin_path(branch)
        return appauto_bin.exists() and appauto_bin.is_file()

    def create_venv(self, branch: str) -> bool:
        """
        Create a new venv for a specific appauto branch.

        Args:
            branch: Git branch name (e.g., "main", "v3.3.1")

        Returns:
            True if successful, False otherwise
        """
        venv_path = self.get_venv_path(branch)
        logger.info(f"Creating venv for appauto branch '{branch}' at {venv_path}")

        try:
            # Check if appauto source exists
            if not self.appauto_source.exists():
                logger.error(f"Appauto source not found at {self.appauto_source}")
                return False

            # Remove existing venv if any
            if venv_path.exists():
                logger.info(f"Removing existing venv at {venv_path}")
                shutil.rmtree(venv_path)

            # Create venv directory
            venv_path.mkdir(parents=True, exist_ok=True)

            # Clone appauto source to venv directory (for isolation)
            appauto_clone = venv_path / "appauto"
            logger.info(f"Cloning appauto from {self.appauto_source}")
            result = subprocess.run(
                ["git", "clone", str(self.appauto_source), str(appauto_clone)],
                cwd=venv_path,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                logger.error(f"Failed to clone appauto: {result.stderr}")
                return False

            # Checkout the specified branch
            logger.info(f"Checking out branch '{branch}'")
            result = subprocess.run(
                ["git", "checkout", branch],
                cwd=appauto_clone,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                logger.error(f"Failed to checkout branch '{branch}': {result.stderr}")
                return False

            # Create virtual environment
            logger.info(f"Creating Python virtual environment")
            result = subprocess.run(
                ["uv", "venv", ".venv"],
                cwd=venv_path,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                logger.error(f"Failed to create venv: {result.stderr}")
                return False

            # Install appauto in editable mode
            logger.info(f"Installing appauto in editable mode")
            # Set VIRTUAL_ENV to ensure uv installs to the correct environment
            env = os.environ.copy()
            env["VIRTUAL_ENV"] = str(venv_path / ".venv")
            result = subprocess.run(
                ["uv", "pip", "install", "-e", str(appauto_clone)],
                cwd=venv_path,
                capture_output=True,
                text=True,
                timeout=600,
                env=env,
            )
            if result.returncode != 0:
                logger.error(f"Failed to install appauto: {result.stderr}")
                return False

            # Verify that appauto command was installed successfully
            appauto_bin = self.get_appauto_bin_path(branch)
            if not appauto_bin.exists():
                logger.error(f"Appauto binary not found at {appauto_bin} after installation")
                logger.error(f"Installation stdout: {result.stdout}")
                logger.error(f"Installation stderr: {result.stderr}")
                return False

            logger.info(f"Successfully created venv for appauto branch '{branch}'")
            return True

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout while creating venv for branch '{branch}'")
            return False
        except Exception as e:
            logger.error(f"Error creating venv for branch '{branch}': {e}")
            return False

    def ensure_venv(self, branch: str) -> Optional[Path]:
        """
        Ensure venv exists for a branch, create if not exists.

        Args:
            branch: Git branch name

        Returns:
            Path to appauto binary if successful, None otherwise
        """
        if self.venv_exists(branch):
            logger.debug(f"Venv already exists for branch '{branch}'")
            return self.get_appauto_bin_path(branch)

        logger.info(f"Venv not found for branch '{branch}', creating...")
        if self.create_venv(branch):
            return self.get_appauto_bin_path(branch)

        return None

    def list_venvs(self) -> list[str]:
        """
        List all available appauto venvs.

        Returns:
            List of branch names that have venvs
        """
        if not self.base_dir.exists():
            return []

        venvs = []
        for venv_dir in self.base_dir.iterdir():
            if venv_dir.is_dir() and venv_dir.name.startswith("appauto-"):
                branch = venv_dir.name.replace("appauto-", "")
                if self.venv_exists(branch):
                    venvs.append(branch)
        return venvs

    def remove_venv(self, branch: str) -> bool:
        """
        Remove venv for a specific branch.

        Args:
            branch: Git branch name

        Returns:
            True if successful, False otherwise
        """
        venv_path = self.get_venv_path(branch)
        if not venv_path.exists():
            logger.warning(f"Venv for branch '{branch}' does not exist")
            return False

        try:
            logger.info(f"Removing venv for branch '{branch}' at {venv_path}")
            shutil.rmtree(venv_path)
            logger.info(f"Successfully removed venv for branch '{branch}'")
            return True
        except Exception as e:
            logger.error(f"Error removing venv for branch '{branch}': {e}")
            return False


# Global instance
_venv_manager: Optional[VenvManager] = None


def get_venv_manager() -> VenvManager:
    """Get the global venv manager instance."""
    global _venv_manager
    if _venv_manager is None:
        _venv_manager = VenvManager()
    return _venv_manager
