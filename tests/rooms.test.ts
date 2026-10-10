import { describe, expect, test } from 'bun:test'
import {
  MAX_PLAYERS, ROUND_DURATION_MS, rooms, wsOpen, wsMessage, wsClose,
  type Room, type Player, finishTimedRound, scoreBoard,
} from '../server/rooms'

function client() {
  const sent: any[] = []
  const ws: any = { data: null, send: (raw: string) => sent.push(JSON.parse(raw)) }
  wsOpen(ws)
  wsMessage(ws, JSON.stringify({ t: 'hello' }))
  return { ws, sent, send: (message: any) => wsMessage(ws, JSON.stringify(message)) }
}

function makeRoom(): { owner: ReturnType<typeof client>; room: Room } {
  const owner = client()
  owner.send({ t: 'create', name: 'Host' })
  const room = rooms.get(owner.sent.find((m) => m.t === 'room').code)!
  return { owner, room }
}

function addPlayer(room: Room, name: string): ReturnType<typeof client> {
  const player = client()
  player.send({ t: 'join', code: room.code, name })
  return player
}

describe('multiplayer room rules', () => {
  test('enforces five total players and allows a slot after someone leaves', () => {
    const { owner, room } = makeRoom()
    const members = [owner, addPlayer(room, 'Two'), addPlayer(room, 'Three'), addPlayer(room, 'Four'), addPlayer(room, 'Five')]
    expect(room.players.size).toBe(MAX_PLAYERS)
    const rejected = addPlayer(room, 'Six')
    expect(rejected.sent.some((m) => m.t === 'error' && m.message.includes('5 max'))).toBe(true)
    expect(room.players.size).toBe(5)
    const leaving = members[4]
    wsClose(leaving.ws)
    const replacement = addPlayer(room, 'Replacement')
    expect(replacement.sent.some((m) => m.t === 'room')).toBe(true)
    expect(room.players.size).toBe(5)
    rooms.delete(room.code)
  })

  test('starts the server-owned five-minute clock only when the owner is ready', () => {
    const { owner, room } = makeRoom()
    expect(room.started).toBe(false)
    expect(room.endsAt).toBeNull()
    owner.send({ t: 'ready' })
    expect(room.started).toBe(true)
    expect(room.endsAt! - room.createdAt).toBeGreaterThanOrEqual(ROUND_DURATION_MS)
    expect(owner.sent.some((m) => m.t === 'go' && m.durationMs === ROUND_DURATION_MS)).toBe(true)
    rooms.delete(room.code)
  })

  test('does not let a non-owner start or rematch a round', () => {
    const { owner, room } = makeRoom()
    const guest = addPlayer(room, 'Guest')
    guest.send({ t: 'ready' })
    expect(room.started).toBe(false)
    owner.send({ t: 'ready' })
    const guestId = guest.ws.data.id
    room.over = true
    room.started = true
    room.endsAt = Date.now() - 1
    const seed = room.seed
    guest.send({ t: 'rematch' })
    expect(room.seed).toBe(seed)
    expect(room.over).toBe(true)
    owner.send({ t: 'rematch' })
    expect(room.over).toBe(false)
    expect(room.started).toBe(false)
    expect(room.endsAt).toBeNull()
    expect(room.players.get(guestId)?.score).toBe(0)
    rooms.delete(room.code)
  })

  test('updates reported scores, keeps the round open after gold, then ranks by score and altitude', () => {
    const { owner, room } = makeRoom()
    const guest = addPlayer(room, 'Guest')
    const third = addPlayer(room, 'Third')
    owner.send({ t: 'ready' })
    const p1 = room.players.get(owner.ws.data.id)!
    const p2 = room.players.get(guest.ws.data.id)!
    owner.send({ t: 'pos', x: 10, y: -7000, w: 500, alt: 120, score: 175 })
    guest.send({ t: 'pos', x: 10, y: -7000, w: 500, alt: 100, score: 185 })
    third.send({ t: 'pos', x: 10, y: -7000, w: 500, alt: 110, score: 175 })
    expect(room.over).toBe(false)
    expect(room.players.get(p1.id)?.score).toBe(175)
    expect(scoreBoard(room).map((p) => p.id)).toEqual([p2.id, p1.id, room.players.get(third.ws.data.id)!.id])
    expect(finishTimedRound(room, room.endsAt! - 1)).toBe(false)
    expect(room.over).toBe(false)
    expect(finishTimedRound(room, room.endsAt!)).toBe(true)
    expect(room.over).toBe(true)
    const finalMessage = owner.sent.filter((m) => m.t === 'over').at(-1)
    expect(finalMessage.reason).toBe('time')
    expect(finalMessage.podium.map((p: any) => p.score)).toEqual([185, 175, 175])
    expect(finalMessage.podium.map((p: any) => p.alt)).toEqual([100, 120, 110])
    expect(finishTimedRound(room, room.endsAt! + 10)).toBe(false)
    rooms.delete(room.code)
  })
})
