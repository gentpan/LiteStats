import { expect, test } from "bun:test"
import { parsePing } from "../src/lib/carrier-probe"

test("carrier ping parses Linux and macOS averages without losing sub-ms RTT", () => {
  expect(parsePing("3 packets transmitted, 3 received, 0% packet loss\nrtt min/avg/max/mdev = 0.110/0.235/0.410/0.125 ms")).toEqual({loss:0,latency:0.235})
  expect(parsePing("3 packets transmitted, 2 packets received, 33.3% packet loss\nround-trip min/avg/max/stddev = 8.0/12.5/17.0/4.5 ms")).toEqual({loss:33.3,latency:12.5})
})
test("carrier ping distinguishes timeout from missing binary or permission failure", () => {
  expect(parsePing("3 packets transmitted, 0 received, 100% packet loss")).toEqual({loss:100,latency:null})
  expect(parsePing("ping: Operation not permitted")).toEqual({loss:null,latency:null})
})
