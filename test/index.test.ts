import { extract } from '../src/index'
import { PassThrough } from 'stream'

describe('stream', () => {
    test('extracts from stream', async () => {
        var stream = new PassThrough()
        const promise = extract(stream, { field: null })
        stream.write(Buffer.from('{ "field": "va'))
        stream.write(Buffer.from('lue" }'))
        stream.end()
        const obj = await promise

        expect(obj).toStrictEqual({ field: "value" })
    })
})