import { Parser } from '../src/parser'

describe('parser', () => {
    test('consumes valid JSON', () => {
        const parser = new Parser({})
        parser.parse(Buffer.from('{ "field": "value" }'))
        parser.getObject()
    })

    test('consumes valid JSON from multiple buffers', () => {
        const parser = new Parser({})
        parser.parse(Buffer.from('{ "field": "va'))
        parser.parse(Buffer.from('lue" }'))
        parser.getObject()
    })

    test('errors on invalid JSON', () => {
        const f = () => {
            const parser = new Parser({})
            parser.parse(Buffer.from('{ "field": "value }'))
            parser.getObject()
        }

        expect(f).toThrow()
    })

    test('extracts string', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": "value" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe("value")
    })

    test('extracts number', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": -1.234 }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe(-1.234)
    })

    test('extracts number with exponent', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": -1.234e1 }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe(-12.34)
    })

    test('extracts number with exponent and sign', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": -1.234e-1 }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe(-0.1234)
    })

    test('extracts array', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": [ "value" ] }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toStrictEqual(["value"])
    })

    test('extracts object', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": { "nested": "value" } }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toStrictEqual({ nested: "value"})
    })

    test('handles unicode', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": "😀\\u263A\\uFE0F" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe("😀☺️")
    })

    test('handles escapes', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "field": "\\\\\\"" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe('\\"')
    })

    test('does not return unselected fields', () => {
        const parser = new Parser({field: null})
        parser.parse(Buffer.from('{ "exempt": "exempt", "field": "value" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field).toBe("value")
        expect(obj.exempt).toBeUndefined()
    })

    test('selects multiple fields', () => {
        const parser = new Parser({field1: null, field2: null})
        parser.parse(Buffer.from('{ "field1": "value1", "field2": "value2" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field1).toBe("value1")
        expect(obj.field2).toBe("value2")
    })

    test('does not required selected fields', () => {
        const parser = new Parser({field1: null, field2: null})
        parser.parse(Buffer.from('{ "field1": "value1" }'))
        var obj = parser.getObject()
        expect(obj).not.toBeNull()
        expect(obj).not.toBeUndefined()
        expect(obj.field1).toBe("value1")
        expect(obj.field2).toBeUndefined()
    })
})