"""
Virtual environment manager for multiple appauto versions.

This module manages completely independent appauto repositories for different branches,
ensuring perfect isolation without any import conflicts.

New architecture:
- Each branch has its own complete git repository
- Each repository has its own .venv directory
- No shared source code or dependencies
"""
import logging
from llm_perf_platform.utils.logging_config import get_logger
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

logger = get_logger(__name__)

# Base directory for all independent appauto repositories
# Changed from 'venvs' to 'appauto-repos' to reflect the new architecture
REPO_BASE_DIR = Path(os.getenv("LLM_PERF_REPO_DIR", str(Path.home() / ".local/share/llm-perf/appauto-repos")))

# Git remote URL for cloning (can be overridden by environment variable)
# This should point to the appauto repository
APPAUTO_GIT_URL = os.getenv("APPAUTO_GIT_URL", "git@github.com:kvcache-ai/appauto.git")


class VenvManager:
    """Manager for independent appauto repository instances.

    Each branch gets its own complete repository clone with dedicated venv.
    This ensures perfect isolation - changes in one branch never affect another.
    """

    def __init__(self, base_dir: Optional[Path] = None, git_url: Optional[str] = None):
        """
        Initialize venv manager.

        Args:
            base_dir: Base directory for repositories (default: REPO_BASE_DIR)
            git_url: Git URL for cloning appauto (default: APPAUTO_GIT_URL)
        """
        self.base_dir = base_dir or REPO_BASE_DIR
        self.git_url = git_url or APPAUTO_GIT_URL
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_repo_path(self, branch: str) -> Path:
        """Get the repository directory path for a specific branch.

        Args:
            branch: Git branch name (e.g., "main", "v3.3.1")

        Returns:
            Path to the independent repository directory
        """
        # Sanitize branch name for filesystem
        safe_branch = branch.replace("/", "_").replace("\\", "_")
        return self.base_dir / safe_branch

    def get_appauto_bin_path(self, branch: str) -> Path:
        """Get the appauto binary path for a specific branch.

        Args:
            branch: Git branch name

        Returns:
            Path to the appauto executable
        """
        repo_path = self.get_repo_path(branch)
        return repo_path / ".venv" / "bin" / "appauto"


    def get_activation_script(self, branch: str) -> Path:
        """Get the activation script path for a specific branch's virtual environment.

        Args:
            branch: Git branch name

        Returns:
            Path to the activation script
        """
        repo_path = self.get_repo_path(branch)
        return repo_path / ".venv" / "bin" / "activate"

    def repo_exists(self, branch: str) -> bool:
        """Check if repository exists for a branch and is on the correct branch.

        Args:
            branch: Git branch name

        Returns:
            True if repository exists and is valid, False otherwise
        """
        appauto_bin = self.get_appauto_bin_path(branch)
        if not (appauto_bin.exists() and appauto_bin.is_file()):
            return False

        # Verify the repository is on the correct branch
        repo_path = self.get_repo_path(branch)

        if not (repo_path / ".git").exists():
            logger.warning(f"Repository directory exists but is not a git repo: {repo_path}")
            return False

        try:
            # Check the current branch
            result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                current_branch = result.stdout.strip()
                if current_branch != branch:
                    logger.warning(
                        f"Repository for '{branch}' exists but is on branch '{current_branch}'. "
                        f"Will recreate repository."
                    )
                    return False
                return True
            else:
                logger.warning(f"Failed to check git branch for '{branch}'")
                return False
        except (subprocess.TimeoutExpired, Exception) as e:
            logger.warning(f"Error checking git branch for '{branch}': {e}")
            return False

    def create_repo(self, branch: str) -> bool:
        """
        Create a new independent repository for a specific appauto branch.

        Args:
            branch: Git branch name (e.g., "main", "v3.3.1")

        Returns:
            True if successful, False otherwise
        """
        repo_path = self.get_repo_path(branch)
        logger.info(f"Creating independent repository for appauto branch '{branch}' at {repo_path}")

        try:
            # Remove existing repository if any
            if repo_path.exists():
                logger.info(f"Removing existing repository at {repo_path}")
                shutil.rmtree(repo_path)

            # Create repository directory
            repo_path.mkdir(parents=True, exist_ok=True)

            # Clone appauto repository with specific branch
            logger.info(f"Cloning appauto from {self.git_url} (branch: {branch})")
            result = subprocess.run(
                ["git", "clone", "--branch", branch, self.git_url, str(repo_path)],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                logger.warning(f"Failed to clone with --branch: {result.stderr}")
                # Fallback: clone without branch, then checkout
                result = subprocess.run(
                    ["git", "clone", self.git_url, str(repo_path)],
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
                if result.returncode != 0:
                    logger.error(f"Failed to clone repository: {result.stderr}")
                    return False

                # Checkout the specific branch
                logger.info(f"Checking out branch '{branch}'")
                checkout_result = subprocess.run(
                    ["git", "checkout", branch],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if checkout_result.returncode != 0:
                    logger.error(f"Failed to checkout branch '{branch}': {checkout_result.stderr}")
                    return False

            logger.info(f"Successfully cloned repository")

            # Verify we're on the correct branch
            verify_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=10,
            )

            if verify_result.returncode == 0:
                current_branch = verify_result.stdout.strip()
                logger.info(f"Repository is on branch '{current_branch}'")
                if current_branch != branch:
                    logger.error(f"Branch mismatch: expected '{branch}', got '{current_branch}'")
                    return False
            else:
                logger.error(f"Failed to verify branch: {verify_result.stderr}")
                return False

            # Create virtual environment in the repository
            logger.info(f"Creating Python virtual environment")
            result = subprocess.run(
                ["uv", "venv", ".venv"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                logger.error(f"Failed to create venv: {result.stderr}")
                return False

            # Install appauto from current directory (non-editable mode for isolation)
            logger.info(f"Installing appauto in non-editable mode for complete isolation")
            # Set VIRTUAL_ENV to ensure uv installs to the correct environment
            env = os.environ.copy()
            env["VIRTUAL_ENV"] = str(repo_path / ".venv")
            result = subprocess.run(
                ["uv", "pip", "install", ".", "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"],
                cwd=repo_path,
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

            logger.info(f"Successfully created independent repository for appauto branch '{branch}'")
            return True

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout while creating repository for branch '{branch}'")
            return False
        except Exception as e:
            logger.error(f"Error creating repository for branch '{branch}': {e}")
            return False

    def ensure_repo(self, branch: str) -> Optional[Path]:
        """
        Ensure repository exists for a branch, create if not exists.

        Args:
            branch: Git branch name

        Returns:
            Path to appauto binary if successful, None otherwise
        """
        if self.repo_exists(branch):
            logger.debug(f"Repository already exists for branch '{branch}'")
            return self.get_appauto_bin_path(branch)

        logger.info(f"Repository not found for branch '{branch}', creating...")
        if self.create_repo(branch):
            return self.get_appauto_bin_path(branch)

        return None

    def list_repos(self) -> list[str]:
        """
        List all available appauto repositories.

        Returns:
            List of branch names that have repositories
        """
        if not self.base_dir.exists():
            return []

        repos = []
        for repo_dir in self.base_dir.iterdir():
            if repo_dir.is_dir():
                branch = repo_dir.name
                if self.repo_exists(branch):
                    repos.append(branch)
        return repos

    def remove_repo(self, branch: str) -> bool:
        """
        Remove repository for a specific branch.

        Args:
            branch: Git branch name

        Returns:
            True if successful, False otherwise
        """
        repo_path = self.get_repo_path(branch)
        if not repo_path.exists():
            logger.warning(f"Repository for branch '{branch}' does not exist")
            return False

        try:
            logger.info(f"Removing repository for branch '{branch}' at {repo_path}")
            shutil.rmtree(repo_path)
            logger.info(f"Successfully removed repository for branch '{branch}'")
            return True
        except Exception as e:
            logger.error(f"Error removing repository for branch '{branch}': {e}")
            return False

    def get_any_repo_path(self) -> Optional[Path]:
        """
        Get path to any existing repository (for operations that don't depend on branch).

        This is useful for operations like listing branches from git remote,
        where any repository will do since they all point to the same remote.

        Returns:
            Path to an existing repository, or None if no repositories exist
        """
        repos = self.list_repos()
        if repos:
            return self.get_repo_path(repos[0])
        return None

    # Backwards compatibility aliases
    def venv_exists(self, branch: str) -> bool:
        """Alias for repo_exists for backwards compatibility."""
        return self.repo_exists(branch)

    def create_venv(self, branch: str) -> bool:
        """Alias for create_repo for backwards compatibility."""
        return self.create_repo(branch)

    def ensure_venv(self, branch: str) -> Optional[Path]:
        """Alias for ensure_repo for backwards compatibility."""
        return self.ensure_repo(branch)

    def list_venvs(self) -> list[str]:
        """Alias for list_repos for backwards compatibility."""
        return self.list_repos()

    def remove_venv(self, branch: str) -> bool:
        """Alias for remove_repo for backwards compatibility."""
        return self.remove_repo(branch)

    def get_venv_path(self, branch: str) -> Path:
        """Alias for get_repo_path for backwards compatibility."""
        return self.get_repo_path(branch)


# Global instance
_venv_manager: Optional[VenvManager] = None


def get_venv_manager() -> VenvManager:
    """Get the global venv manager instance."""
    global _venv_manager
    if _venv_manager is None:
        _venv_manager = VenvManager()
    return _venv_manager
