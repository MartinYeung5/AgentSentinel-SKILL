// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISentinelRegistry {
    struct SkillVersion {
        bytes32 versionHash;
        string  uri;
        address maintainer;
        uint256 pricePerCall;
        bool    active;
        uint256 registeredAt;
    }
    function getVersion(string calldata version) external view returns (SkillVersion memory);
}

/**
 * @title SentinelPayments
 * @notice Settles pay-per-call charges for AgentSentinel invocations.
 *         Agents top up a balance; each verified invocation deducts the
 *         registered pricePerCall and forwards funds to the maintainer.
 */
contract SentinelPayments {
    ISentinelRegistry public immutable registry;
    address public operator;

    mapping(address => uint256) public balances; // agent wallet => deposited wei
    mapping(bytes32 => bool)    public consumed; // actionHash => already charged

    event Deposit(address indexed agent, uint256 amount);
    event Withdraw(address indexed agent, uint256 amount);
    event Charged(address indexed agent, string version, uint256 amount, bytes32 actionHash);

    modifier onlyOperator() {
        require(msg.sender == operator, "Sentinel: not operator");
        _;
    }

    constructor(address _registry, address _operator) {
        registry = ISentinelRegistry(_registry);
        operator = _operator;
    }

    function deposit() external payable {
        require(msg.value > 0, "Sentinel: zero deposit");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Sentinel: insufficient");
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Sentinel: send failed");
        emit Withdraw(msg.sender, amount);
    }

    function charge(
        address agent,
        string calldata version,
        bytes32 actionHash
    ) external onlyOperator returns (uint256 amount) {
        require(!consumed[actionHash], "Sentinel: already charged");
        ISentinelRegistry.SkillVersion memory v = registry.getVersion(version);
        require(v.active, "Sentinel: version inactive");
        amount = v.pricePerCall;
        require(balances[agent] >= amount, "Sentinel: low balance");

        balances[agent] -= amount;
        consumed[actionHash] = true;

        (bool ok, ) = v.maintainer.call{value: amount}("");
        require(ok, "Sentinel: pay maintainer failed");

        emit Charged(agent, version, amount, actionHash);
    }

    function balanceOf(address agent) external view returns (uint256) {
        return balances[agent];
    }
}
