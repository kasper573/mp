# encoding

Binary data encoding and decoding utilities

This package provides a lightweight wrapper around CBOR (Concise Binary Object Representation) encoding for efficient binary serialization. It creates encoding/decoding pairs with custom headers to distinguish between different types of messages. The package uses float32 precision by default for smaller payload sizes and includes error handling for encoding/decoding operations. It's designed for network communication where compact binary formats are preferred over JSON.
