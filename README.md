# Node Port Scanner

A fast, lightweight TCP port scanner written in Node.js with OS detection, network-wide scanning, and adaptive timeout based on real RTT.

---

## Features

- TCP port scanning with configurable port range
- Adaptive timeout using live RTT measurement via ping
- Batch scanning with concurrency control
- Filtered port retry logic
- Network-wide scanning (CIDR /24)
- OS detection via TTL fingerprinting
- Service name resolution on open ports

---

## Requirements

- Node.js v18+ (uses top-level `await`, ES modules)
- Unix-based OS (macOS / Linux) — uses `ping`, `sed`, `awk`

---

## Installation

```bash
git clone https://github.com/adarshraj077/port-scanner-node-.git
cd port-scanner
npm install
```

---

## Usage

```bash
node scanner.js <target> <start_port> <end_port> [flags]
```

### Arguments

| Argument | Description | Default |
|---|---|---|
| `target` | IP address or CIDR range | required |
| `start_port` | Starting port number | `1` |
| `end_port` | Ending port number | `8000` |
| `-O` | Enable OS detection | off |

### Examples

```bash
# Scan single host, ports 1–1000
node scanner.js 192.168.1.1 1 1000

# Scan single host with OS detection
node scanner.js 192.168.1.1 1 8000 -O

# Scan entire /24 network
node scanner.js 192.168.1.0/24 1 8000

# Scan entire /24 network with OS detection
node scanner.js 192.168.1.0/24 1 8000 -O
```

### Output

```
┌─ 192.168.1.1
│  [open] 22/tcp : ssh
│  [open] 80/tcp : http
│  [open] 443/tcp : https
│  [filtered] 3 ports
└─ 3 open port(s)

192.168.1.5 → Windows
┌─ 192.168.1.5
│  [open] 445/tcp : microsoft-ds
└─ 1 open port(s)
```

---

## How It Works

### 1. RTT Measurement
Before scanning, the scanner pings the target 4 times and calculates the average round-trip time using `ping -c 4`. This RTT drives the adaptive timeout:

```
timeout = min(RTT × 8, 1000ms)
```

For unreachable hosts during network scans, it falls back to 100ms.

### 2. TCP Port Scanning
Each port is scanned by attempting a raw TCP connection via `net.Socket`. The result is classified by the error code:

| Error | Status | Meaning |
|---|---|---|
| Connection success | `open` | Port is listening |
| `ECONNREFUSED` | `closed` | RST received |
| `EHOSTUNREACH` | `filtered` | ICMP unreachable |
| `ENETUNREACH` | `filtered` | Network unreachable |
| `ETIMEDOUT` | `filtered` | No response (ambiguous) |
| Socket timeout | `no-response` | Timed out before connect |

### 3. Batch Scanning
Ports are scanned in batches of 150 using `Promise.all()` for concurrency. Filtered ports are retried once at 1.5× the original timeout before being marked filtered.

### 4. Network Scanning
For CIDR `/24` targets, the scanner iterates `1–254` (skipping `.0` network and `.255` broadcast) in batches of 30. Each alive host is pinged first, then port-scanned.

### 5. OS Detection (`-O` flag)
OS is fingerprinted from the TTL value in the ping response using the `ttl=(\d+)` regex. The received TTL is rounded up to the nearest known default to estimate the starting TTL and hop count:

| Starting TTL | OS Guess |
|---|---|
| 64 | Linux / Android / macOS |
| 128 | Windows |
| 255 | Cisco / FreeBSD / Solaris |

```
hops = startingTTL - receivedTTL
```

Example: received TTL of 57 → starting TTL 64 → 7 hops → Linux/macOS.

> **Note:** TTL alone cannot distinguish Linux from macOS (both default to 64). For more accurate detection, tools like nmap use full TCP/IP stack fingerprinting across ~15 probe types.

---

## Limitations

- macOS and Linux are indistinguishable by TTL alone
- OS detection is unreliable behind VPNs, proxies, or NAT
- Requires Unix ping flags (`-c`, `-W`) — not compatible with Windows
- No banner grabbing or version detection
- CIDR support is limited to `/24`
