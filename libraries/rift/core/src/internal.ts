export const onChange = Symbol("onChange");
export const onDirty = Symbol("onDirty");

export const OP_SPAWN = 0x01;
export const OP_UPDATE = 0x02;
export const OP_DESTROY = 0x03;
export const OP_EVENT = 0x04;
export const OP_COMPONENT_REMOVE = 0x05;
