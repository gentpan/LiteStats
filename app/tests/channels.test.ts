import { test, expect } from "bun:test"
import { smtpSchema, telegramSchema } from "../src/lib/channel-schema"

test("SMTP config rejects URLs and invalid ports and requires a sender",()=>{
  const base={host:"smtp.example.com",port:587,security:"starttls",username:"user",password:"",fromEmail:"sender@example.com",fromName:"LiteStats"}
  expect(smtpSchema.safeParse(base).success).toBe(true)
  for(const patch of [{port:0},{port:65536},{host:"https://smtp.example.com/path"},{fromEmail:"invalid"},{security:"none"}]) expect(smtpSchema.safeParse({...base,...patch}).success).toBe(false)
})
test("Telegram validates token paths and accepts supported chat identifiers",()=>{
  for(const chatId of ["123456","-100123456","@my_channel"]) expect(telegramSchema.safeParse({token:"123456:ABC_def-123",chatId}).success).toBe(true)
  expect(telegramSchema.safeParse({token:"123:abc/getUpdates",chatId:"123"}).success).toBe(false)
  expect(telegramSchema.safeParse({token:"",chatId:"123"}).success).toBe(true) // preserves stored credential
  expect(telegramSchema.safeParse({token:"123:abc",chatId:"https://example.com"}).success).toBe(false)
})
