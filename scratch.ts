import { geocode, toOverpassAreaId } from './src/data/osm/Geocoder'
import { fetchRoads } from './src/data/osm/OverpassClient'

async function main(): Promise<void> {
    const place = await geocode(process.argv[2] ?? 'Orhei')
    console.log('Matched:', place.displayName)

    const started = Date.now()
    const data = await fetchRoads(toOverpassAreaId(place))
    const seconds = ((Date.now() - started) / 1000).toFixed(1)

    const ways = data.elements.filter((e) => e.type === 'way').length
    const nodes = data.elements.filter((e) => e.type === 'node').length
    const size = (JSON.stringify(data).length / 1e6).toFixed(1)
    console.log(`${ways} ways, ${nodes} nodes, ${size} MB, ${seconds}s`)
}

main()