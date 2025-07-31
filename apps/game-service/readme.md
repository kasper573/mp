# Game service

Instance based game service. One service handles the state of one area in isolation.

Selects the server side parts of the [game package](../game) and turns them into a long running stateful WebSocket client that connects to the Gateway from which it receives client events and it sends back game state patches. It also broadcasts events to other game service instances for things like communicating players wanting to move between areas.
