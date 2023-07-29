import { Parser } from './parser'

const once = <A extends any[], R, T>(
  fn: (this: T, ...arg: A) => R
): ((this: T, ...arg: A) => R | undefined) => {
  let done = false
  return function (this: T, ...args: A) {
    return done ? void 0 : ((done = true), fn.apply(this, args))
  }
}

export const extractCallback = function(stream: NodeJS.ReadableStream, schema: object, callback: (error: any, obj: object | undefined) => void) {
    if (!callback) {
        return stream
    }

    const callbackOnce = once(callback)
    const parser = new Parser(schema)

    stream.on('data', function(data) {
        try {
            parser.parse(data)
        } catch (err) {
            callbackOnce(err, undefined)
        }
    })

    stream.on('end', function() {
        callbackOnce(undefined, parser.getObject())
    })

    stream.on('close', function() {
        callbackOnce(new Error('Premature close'), undefined)
    })

    stream.on('error', callbackOnce)

    return stream
}

export const extract = function(stream: NodeJS.ReadableStream, schema: object) {
    return new Promise((resolve, reject) => {
        extractCallback(stream, schema, (err, obj) => err ? reject(err) : resolve(obj))
    })
}