# sync

Data synchronization utilities for real-time multiplayer

This package implements efficient data synchronization for multiplayer games using patch-based updates. It includes sync entities for managing shared state, sync maps for collections, and patch deduplication to minimize network traffic. The system tracks changes to objects and generates minimal binary patches that can be applied to keep multiple clients in sync. It supports entity lifecycle management and event-driven updates while maintaining consistency across distributed clients.
