import StringView from './stringview';
/**
 * COmpact Binary Typed Object Notation
 * Inspired by JSON structure, COBTON is intented to serialize / unserialize arbitrary objects in and from byte arrays in a very compact way,
 * although it may still be compressible(GZIP).
 * Arbitrary objects meaning every primitive types in javascript(number,string,boolean,object...), standard javascript objects(DateTime,RegExp...), user classes,
 * allowing for object references and cyclic references, without loss of anything, including prototypes.
 * @copyright Rémi Brémont 2016
 */
export default class Cobton {
    /**
     * Returns the number of bytes required to serialize the argument obj
     */
    static countBytes(obj) {
        return this.serialize(obj, null, 0, true);
    }
    /**
     * Serializes the specified object in a new ArrayBuffer and returns the ArrayBuffer
     */
    static getArrayBuffer(obj) {
        let bytesCount = this.countBytes(obj);
        let arrayBuffer = new ArrayBuffer(bytesCount);
        let view = new DataView(arrayBuffer);
        this.serialize(obj, view);
        return arrayBuffer;
    }
    /**
     * Parses the specified buffer and returns the corresponding Cobton serialized object
     */
    static getObject(buffer) {
        let view = new DataView(buffer);
        let offset = 0;
        let currentState;
        currentState = null, null, 'none';
        while (offset < buffer.byteLength) {
            let byte = view.getUint8(offset);
            switch (byte) {
                case Cobton.UndefinedValue:
                    if (currentState.value == null)
                        currentState = null, undefined, 'none';
                    else if (currentState.valueOwnerType === 'array') {
                        currentState.value.push(undefined);
                    }
                    else if (currentState.valueOwnerType === 'object') {
                        currentState.value[currentState.currentObjectKey] = undefined;
                    }
                    else {
                        throw 'illegal state';
                    }
                    break;
                case Cobton.NullValue:
                    currentState = null, null;
                    break;
                case Cobton.FalseValue:
                    currentState = null, false;
                    break;
                case Cobton.TrueValue:
                    currentState = null, true;
                    break;
                case Cobton.ArrayStart:
                    if (currentState.value == null)
                        currentState = null, [], 'array';
                    else if (currentState.valueOwnerType === 'array') {
                        currentState.value.push([]);
                    }
                    else if (currentState.valueOwnerType === 'object') {
                        currentState.value[currentState.currentObjectKey] = undefined;
                    }
                    else {
                        throw 'illegal state';
                    }
                    break;
                default:
                    throw 'unexpected byte';
            }
        }
    }
    /**
     * Serializes the specified object with the specified DataView, or a new DataView if unspecified
     */
    static serialize(obj, view, offset = 0, countBytes = false) {
        if (arguments.length < 1) {
            throw 'missing arguments';
        }
        if (typeof obj === 'undefined') {
            if (!countBytes)
                view.setUint8(offset, Cobton.UndefinedValue);
            offset++;
            return offset;
        }
        if (obj === null) {
            if (!countBytes)
                view.setUint8(offset, Cobton.NullValue);
            offset++;
            return offset;
        }
        if (typeof obj === 'boolean') {
            if (!countBytes)
                view.setUint8(offset, obj ? Cobton.TrueValue : Cobton.FalseValue);
            offset++;
            return offset;
        }
        if (typeof obj === 'number') {
            return Cobton.serializeNumber(obj, view, offset, countBytes);
        }
        if (typeof obj === 'string') {
            return Cobton.serializeString(obj, view, offset, countBytes);
        }
        if (typeof obj === 'function') {
            return Cobton.serializeFunction(obj, view, offset, countBytes);
        }
        if (typeof obj === 'object') {
            return Cobton.serializeObject(obj, view, offset, countBytes);
        }
        throw 'unexpected object type';
    }
    /**
     * Serializes a number
     */
    static serializeNumber(num, view, offset = 0, countBytes = false) {
        if (Number.isNaN(num)) {
            if (!countBytes) {
                view.setUint8(offset, Cobton.NanValue);
            }
            return offset + 1;
        }
        if (!Number.isFinite(num)) {
            if (!countBytes) {
                view.setUint8(offset, Cobton.InfiniteValue);
            }
            return offset + 1;
        }
        if (num === 0) {
            if (!countBytes) {
                view.setUint8(offset, Cobton.ZeroValue);
            }
            return offset + 1;
        }
        if (Number.isInteger(num)) {
            if (num >= -0x80 && num < 0x80) {
                if (!countBytes) {
                    view.setUint8(offset, Cobton.int8Value);
                    view.setInt8(offset + 1, num);
                }
                return offset + 2;
            }
            if (num >= -0x8000 && num < 0x8000) {
                if (!countBytes) {
                    view.setUint8(offset, Cobton.int16Value);
                    view.setInt16(offset + 1, num);
                }
                return offset + 3;
            }
            if (num >= -0x80000000 && num < 0x80000000) {
                if (!countBytes) {
                    view.setUint8(offset, Cobton.int8Value);
                    view.setInt32(offset + 1, num);
                }
                return offset + 5;
            }
            throw 'Integer but value too large';
        }
        //assert Number.isInteger(num) === false
        if (num > -Cobton.FLOAT32_MAX_VALUE && num < Cobton.FLOAT32_MAX_VALUE) {
            if (!countBytes) {
                view.setUint8(offset, Cobton.float64Value);
                view.setFloat32(offset + 1, num);
            }
            return offset + 5;
        }
        else {
            if (!countBytes) {
                view.setUint8(offset, Cobton.float64Value);
                view.setFloat64(offset + 1, num);
            }
            return offset + 9;
        }
    }
    /**
     * Serializes a string
     */
    static serializeString(str, view, offset = 0, countBytes = false) {
        if (str.length === 0) {
            view.setUint8(offset, Cobton.EmptyStringValue);
            return offset + 1;
        }
        if (str.length <= 0xFF) {
            view.setUint8(offset, Cobton.StringX1Value);
            view.setUint8(offset, str.length);
            offset += 2;
        }
        else if (str.length <= 0xFFFF) {
            view.setUint8(offset, Cobton.StringX2Value);
            view.setUint16(offset, str.length);
            offset += 3;
        }
        else if (str.length <= 0xFFFFFFFF) {
            view.setUint8(offset, Cobton.StringX4Value);
            view.setUint32(offset, str.length);
            offset += 5;
        }
        let stringView = new StringView(str, 'UTF-8');
        let stringBuffer = new Uint8Array(stringView.buffer);
        let len = stringBuffer.byteLength;
        for (let i = 0; i < len; i++) {
            view.setUint8(offset + i, stringBuffer[i]);
        }
        return offset + len;
    }
    static serializeObject(obj, view, offset = 0, countBytes = false) {
        if (obj.constructor === Array) {
            return Cobton.serializeArray(obj, view, offset, countBytes);
        }
    }
    static serializeArray(arr, view, offset = 0, countBytes = false) {
        if (!countBytes)
            view.setUint8(offset, Cobton.ArrayStart);
        offset++;
        for (let i = 0; i < arr.length; i++) {
            offset = Cobton.serialize(arr[i], view, offset, countBytes);
        }
        if (!countBytes)
            view.setUint8(offset, Cobton.ArrayEnd);
        offset++;
        return offset;
    }
    static serializeFunction(func, view, offset = 0, countBytes = false) {
        return 0;
    }
}
Cobton.UndefinedValue = 0;
Cobton.NullValue = 1;
Cobton.FalseValue = 2;
Cobton.TrueValue = 3;
Cobton.NanValue = 4;
Cobton.InfiniteValue = 5;
Cobton.ZeroValue = 6;
Cobton.int8Value = 7;
Cobton.int16Value = 8;
Cobton.int32Value = 9;
Cobton.float32Value = 10;
Cobton.float64Value = 11;
Cobton.EmptyStringValue = 12;
Cobton.StringX1Value = 13;
Cobton.StringX2Value = 14;
Cobton.StringX4Value = 15;
Cobton.BlobValue = 16;
Cobton.ArrayStart = 17;
Cobton.ArrayEnd = 18;
Cobton.ObjectStart = 17;
Cobton.ObjectEnd = 18;
Cobton.Reference = 19;
Cobton.PrototypeReference = 20;
Cobton.FLOAT32_MAX_VALUE = (2.0 - Math.pow(2, -23)) * Math.pow(2, 127);
