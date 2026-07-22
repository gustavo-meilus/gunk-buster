# The current Git index defines repository inventory

Path liveness is determined from the current Git index and directories implied by its entries, never complete history or transient untracked worktree contents. An unstaged deletion remains live while indexed; a staged deletion is dead; a staged rename makes only the new path live; and an untracked replacement remains dead until added. This makes findings reproducible from declared repository state and prevents historical paths from rescuing claims about content that is no longer tracked.
