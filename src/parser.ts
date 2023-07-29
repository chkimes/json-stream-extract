const debugLog = false
const log = (val: any) => {}

enum StateType {
    None = 0,
    Object = 1,
    Array = 2,
    String = 3,
    Number = 4,
    FieldName = 5,
    Boolean = 6,
}

abstract class State {
    constructor(parent: State | undefined, type: StateType) {
        this.parent = parent
        this.type = type
    }

    parent: State | undefined
    type: StateType
}

class ObjectState extends State {
    constructor(parent: State | undefined) {
        if (debugLog) {
            log("Transitioned to ObjectState")
        }
        super(parent, StateType.Object)
    }

    readField: boolean = false
    readSemiColon: boolean = false
    readValue: boolean = false
}

class ArrayState extends State {
    constructor(parent: State | undefined) {
        if (debugLog) {
            log("Transitioned to ArrayState")
        }
        super(parent, StateType.Array)
    }

    readValue: boolean = false
}

class StringLikeState extends State {
    constructor(parent: State | undefined, type: StateType) {
        super(parent, type)
    }

    escaping: boolean = false
    escapingUnicodeCharsRemaining: number = 0
}

class StringState extends StringLikeState {
    public constructor(parent: State | undefined) {
        if (debugLog) {
            log("Transitioned to StringState")
        }
        super(parent, StateType.String)
    }
}

class FieldNameState extends StringLikeState {
    public constructor(parent: State | undefined) {
        if (debugLog) {
            log("Transitioned to FieldNameState")
        }
        super(parent, StateType.FieldName)
    }
}

class NumberState extends State {
    public constructor(parent: State | undefined, negative: boolean) {
        if (debugLog) {
            log("Transitioned to NumberState")
        }
        super(parent, StateType.Number)

        this.sawFirstDigit = !negative
        this.sawDot = false
        this.sawExponent = false
        this.sawSign = false
    }

    sawFirstDigit: boolean
    sawDot: boolean
    sawExponent: boolean
    sawSign: boolean
}

class MaybeBooleanState extends State {
    constructor(parent: State | undefined, val: boolean) {
        if (debugLog) {
            log("Transitioned to MaybeBooleanState")
        }
        super(parent, StateType.Boolean)

        this.val = val
    }

    index: number = 1
    val: boolean
}

function isObjectState(object: any): object is ObjectState {
    return object.type == StateType.Object
}

function isArrayState(object: any): object is ArrayState {
    return object.type == StateType.Array
}

function isStringState(object: any): object is StringState {
    return object.type == StateType.String
}

function isFieldNameState(object: any): object is FieldNameState {
    return object.type == StateType.FieldName
}

function isNumberState(object: any): object is NumberState {
    return object.type == StateType.Number
}

function isBooleanState(object: any): object is MaybeBooleanState {
    return object.type == StateType.Boolean
}

function isWhitespace(char: number) : boolean {
    return char == 9  // '\t'
        || char == 10 // '\n'
        || char == 13 // '\r'
        || char == 32 // ' '
}

function isDigit(char: number) : boolean {
    return char >= 48 && char <= 57
}

function isLowercaseAlphabetical(char: number) : boolean {
    return char >= 97 || char <= 122
}

function error(errorMsg: string, char: number) : never {
    throw new Error(errorMsg + " Unexpected token: " + String.fromCharCode(char))
}

export class Parser {
    schema: object
    stack: State[]
    saving: boolean
    buffers: Buffer[]
    workBuffer: Buffer
    workIndex: number
    done: boolean
    output: any

    currentState: State | undefined
    currentTopLevelField: string | null

    constructor(schema: object) {
        if (typeof schema !== 'object') {
            throw new Error("Schema type must be 'object'")
        }

        this.schema = schema
        this.stack = []
        this.saving = false
        this.buffers = []
        this.workBuffer = Buffer.allocUnsafe(8096)
        this.workIndex = 0
        this.done = false
        this.currentTopLevelField = null
        this.output = {}
    }

    parse(buffer: Buffer) {
        for (let i = 0; i < buffer.length; i++) {
            this.readByte(buffer[i])
        }
    }

    readByte(char: number) {
        if (debugLog) {
            log('Character: ' + String.fromCharCode(char) + ', State: ' + (this.currentState ? this.currentState.type : 0 ))
        }
        const state = this.currentState
        if (state == null) {
            if (isWhitespace(char)) {
                return
            }

            if (this.done) {
                error("Received complete JSON object!", char)
            }

            if (char != 123) { // {}
                throw new Error("This library only extracts fields from top-level objects")
            }
            
            this.currentState = new ObjectState(state)
            return
        }

        if (this.saving) {
            if (this.workIndex == this.workBuffer.length) {
                this.buffers.push(this.workBuffer)
                this.workBuffer = Buffer.allocUnsafe(8096)
                this.workIndex = 0
            }
            this.workBuffer[this.workIndex++] = char
        }

        switch (state.type) {
            case StateType.Object:
                this.readByteObject(char)
                break;
            case StateType.FieldName:
                this.readByteString(char)
                break;
            case StateType.String:
                this.readByteString(char)
                break;
            case StateType.Number:
                this.readByteNumber(char)
                break;
            case StateType.Array:
                this.readByteArray(char)
                break;
            case StateType.Boolean:
                this.readByteBoolean(char)
                break;
        }
    }

    readByteObject(char: number) {
        const state = this.currentState as ObjectState
        if (isWhitespace(char)) {
            return
        }

        if (!state.readField) {
            if (char == 125) { // '}'
                this.popStack()
                return
            }

            if (char != 34) { // '"'
                error("Expected field name!", char)
            }

            if (!state.parent) {
                // top-level field, we should save the bytes to get the field name
                this.saving = true
                this.saveCharacter(char)
            }

            this.currentState = new FieldNameState(state)
            return
        }

        if (!state.readSemiColon) {
            if (char != 58) { // ':'
                error("Expected semicolon!", char)
            }

            state.readSemiColon = true
            return
        }

        if (!state.readValue) {
            if (!state.parent && this.currentTopLevelField && this.currentTopLevelField in this.schema)
            {
                this.saving = true
                this.saveCharacter(char)
            }

            if (char == 34) { // '"'
                this.currentState = new StringState(state)
                return
            }

            if (char == 123) { // '{'
                this.currentState = new ObjectState(state)
                return
            }

            if (char == 91) { // '['
                this.currentState = new ArrayState(state)
                return
            }

            if (char == 45) { // '-'
                this.currentState = new NumberState(state, true)
                return
            }

            if (isDigit(char)) { // '0'-'9'
                this.currentState = new NumberState(state, false)
                return
            }

            if (char == 116) { // 't'
                this.currentState = new MaybeBooleanState(state, true)
                return
            }

            if (char == 102) { // 'f'
                this.currentState = new MaybeBooleanState(state, false)
                return
            }

            error("Expected value!", char)
        }

        // if we've gotten here, the value has been read so we expect either to
        // end the object or see a comma
        if (char == 44) { // ','
            state.readField = false
            state.readSemiColon = false
            state.readValue = false
        } else if (char == 125) { // '}'
            this.popStack()
        } else {
            error("Expected end of object or comma!", char)
        }
    }

    readByteString(char: number) {
        const state = this.currentState as StringLikeState
        if (state.escaping) {
            if (state.escapingUnicodeCharsRemaining) {
                state.escapingUnicodeCharsRemaining--

                if (!state.escapingUnicodeCharsRemaining) {
                    state.escaping = false
                }

                return
            }

            if (char == 117) { // 'u'
                state.escapingUnicodeCharsRemaining = 4
                return
            }

            state.escaping = false
            return
        }

        if (char >= 128) {
            // Handle UTF-8 codepoint
            if (char < 192) {
                throw new Error("Unknown UTF-8 code point!")
            } else if (char < 224) {
                state.escaping = true
                state.escapingUnicodeCharsRemaining = 1
            } else if (char < 240) {
                state.escaping = true
                state.escapingUnicodeCharsRemaining = 2
            } else if (char < 248) {
                state.escaping = true
                state.escapingUnicodeCharsRemaining = 3
            } else {
                throw new Error("Unknown UTF-8 code point!")
            }

            return
        }

        if (char == 92) {
            state.escaping = true
        }

        if (char == 34) { // "
            this.popStack()
        }
    }

    readByteNumber(char: number) {
        const state = this.currentState as NumberState
        if (!state.sawFirstDigit) {
            if (!isDigit(char)) {
                error("Expected digit!", char)
            }

            state.sawFirstDigit = true
            return
        }

        if (isDigit(char)) {
            return
        }

        if (char == 46) { // '.'
            if (state.sawDot || state.sawExponent) {
                error("Invalid token in number!", char)
            }

            state.sawDot = true
            return
        }

        if (char == 69 || char == 101) { // 'E' 'e'
            if (state.sawExponent) {
                error("Invalid token in number!", char)
            }

            state.sawExponent = true
            return
        }

        if (char == 43 || char == 45) { // '+' '-'
            if (!state.sawExponent) {
                error("Invalid token in number!", char)
            }

            if (state.sawSign) {
                error("Invalid token in number!", char)
            }

            state.sawSign = true
            return
        }

        if (isWhitespace(char)
            || char == 44      // ','
            || char == 93      // ']'
            || char == 125) {  // '}'
            // we've reached the end of the number here, but we need to do a few gymnastics to parse it
            // numbers don't self-close like strings or objects or arrays so the indicator that the number
            // is over is any whitespace or valid syntactic characters like ,]}
            //
            // we want these special characters to be handled in their parent context, so we can "rewind"
            // and parse the character again
            if (this.saving) {
                this.workIndex--
            }
            this.popStack()
            this.readByte(char)
        }
    }

    readByteArray(char: number) {
        const state = this.currentState as ArrayState
        if (isWhitespace(char)) {
            return
        }

        if (!state.readValue) {
            if (char == 34) { // '"'
                this.currentState = new StringState(state)
                return
            }

            if (char == 123) { // '{'
                this.currentState = new ObjectState(state)
                return
            }

            if (char == 91) { // '['
                this.currentState = new ArrayState(state)
                return
            }

            if (char == 45) { // '-'
                this.currentState = new NumberState(state, true)
                return
            }

            if (isDigit(char)) { // '0'-'9'
                this.currentState = new NumberState(state, false)
                return
            }

            error("Expected value!", char)
        }

        if (char == 93) { // ']'
            this.popStack()
            return
        }

        if (char != 44) { // ','
            error("Expected comma or end of array!", char)
        }
    
        state.readValue = false
    }

    readByteBoolean(char: number) {
        const state = this.currentState as MaybeBooleanState

        if (isLowercaseAlphabetical(char)) {
            state.index++

            if (state.val) {
                if (state.index == 4) {
                    this.popStack()
                    return
                }
            } else {
                if (state.index == 5) {
                    this.popStack()
                    return
                }
            }
        } else {
            error("Invalid token in boolean!", char)
        }
    }

    saveCharacter(char: number) {
        if (this.workIndex == this.workBuffer.length) {
            this.buffers.push(this.workBuffer)
            this.workBuffer = Buffer.allocUnsafe(8096)
            this.workIndex = 0
        }

        this.workBuffer[this.workIndex++] = char
    }

    popStack() {
        var parent = this.currentState!.parent;
        if (debugLog) {
            log('Popped stack to: ' + (parent ? parent.type : 0))
        }

        if (!parent) {
            if (this.currentState!.type != StateType.Object) {
                throw new Error("Invariant: Top-level type MUST be Object")
            }

            this.done = true
        } else if (isObjectState(parent)) {
            if (this.currentState!.type == StateType.FieldName) {
                if (!parent.parent) {
                    // read top-level field
                    this.saving = false
                    this.currentTopLevelField = JSON.parse(this.readSavedString())

                    if (debugLog) {
                        log('Top-Level field: ' + this.currentTopLevelField)
                    }
                }

                parent.readField = true
            } else {
                // read top-level value
                if (!parent.parent) {
                    if (this.saving) {
                        if (!this.currentTopLevelField) {
                            throw new Error("Invariant: saving a value but top-level field name is not populated")
                        }

                        this.saving = false
                        const value = this.readSavedString()
                        this.output[this.currentTopLevelField] = JSON.parse(value)
                        this.currentTopLevelField = null
                    }
                }
                
                parent.readValue = true
            }
        } else if (isArrayState(parent)) {
            parent.readValue = true
        }

        this.currentState = parent;
    }

    readSavedString() {
        let str: string;
        if (this.buffers.length) {
            this.buffers.push(this.workBuffer.subarray(0, this.workIndex))
            str = Buffer.concat(this.buffers).toString()
        } else {
            str = this.workBuffer.subarray(0, this.workIndex).toString()
        }

        this.buffers.length = 0
        this.workIndex = 0

        return str
    }

    getObject() {
        if (!this.done) {
            throw new Error("A complete JSON object has not yet been received!")
        }
        return this.output
    }

    private getDebug() {
        return { 
            output: this.output,
            field: this.currentTopLevelField,
            value: this.workBuffer.subarray(0, this.workIndex).toString()
        }
    }
}