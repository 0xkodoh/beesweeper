// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BeeSweeperScores
/// @notice Lightweight score submission foundation for BeeSweeper.
/// @dev Scores are emitted as events to keep gas low. No rewards, NFTs, or betting logic.
contract BeeSweeperScores {
    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        string difficulty,
        uint256 completionTime,
        uint256 timestamp
    );

    function submitScore(uint256 score, string calldata difficulty, uint256 completionTime) external {
        require(bytes(difficulty).length > 0, "Difficulty required");
        require(completionTime > 0, "Completion time required");

        emit ScoreSubmitted(msg.sender, score, difficulty, completionTime, block.timestamp);
    }
}
