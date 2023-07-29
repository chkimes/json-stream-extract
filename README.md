# json-stream-extract
Extract specific JSON fields from a readable stream using limited allocations.

```
// myFile.json:
// {
//   "myField": "myValue",
//   "myOtherField": "myOtherValue"
// }

const stream = fs.createReadStream('myFile.json')
const minimal = await extract(stream, {
  myField: null
})
console.log(minimal)

// {
//   myField: 'myValue'
// }
```

## Why would I use this?
This is useful for extracting specific small fields out of large JSON blobs without suffering the large allocations required from `JSON.parse`.
Allocations are limited to only those necessary for creating the top-level field strings and for any values that are specified for extraction.

## Performance
This is roughly 2-3x slower than `JSON.parse`, but the reduced allocations may make that trade-off worth the cost.
