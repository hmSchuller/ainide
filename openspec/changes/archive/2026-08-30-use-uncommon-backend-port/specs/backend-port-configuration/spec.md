## Purpose

Provides a predictable, less commonly occupied local backend port while keeping development traffic aligned with the port selected for the running application server.

## ADDED Requirements

### Requirement: Backend uses a loopback uncommon default port

The local application server SHALL bind to `127.0.0.1:43127` when no valid backend port override is provided. A valid `PORT` value SHALL replace the default port without changing the default loopback binding.

#### Scenario: Server starts with the default port

- **WHEN** the local application server starts without a valid `PORT` value
- **THEN** it accepts HTTP and WebSocket connections on `127.0.0.1:43127`

#### Scenario: Server starts with a port override

- **WHEN** the local application server starts with `PORT` set to a valid TCP port
- **THEN** it accepts HTTP and WebSocket connections on `127.0.0.1` at that port instead of `43127`

### Requirement: Development proxy follows the backend port

The development client SHALL route its API and WebSocket paths to the same backend port selected by the local application server, using `43127` when no valid `PORT` override is provided.

#### Scenario: Development uses the default backend port

- **WHEN** the application server and development client start without a valid `PORT` value
- **THEN** requests for `/api`, `/events`, and `/terminal` are forwarded to `127.0.0.1:43127`

#### Scenario: Development uses a port override

- **WHEN** the application server and development client start with the same valid `PORT` value
- **THEN** requests for `/api`, `/events`, and `/terminal` are forwarded to `127.0.0.1` at that configured port
