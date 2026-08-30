import { describe, expect, it } from "vitest"
import {
  assertSafeOperationsText,
  assertSafeSpecifications,
} from "./content-safety"

describe("shared content safety", () => {
  it.each([
    "Contact agent@example.com",
    "收件人王小明",
    "Call +886 912-345-678",
    "Deliver to 25 Main Street",
    "送至台北市信義區忠孝東路五段10號",
    "customer id CUST-1001",
    "card number 4111111111111111",
    "password: demo-secret",
    "https://unsafe.example",
    "<script>alert(1)</script>",
    "javascript:alert(1)",
    "window.location = 'elsewhere'",
    "alert(1)",
  ])("rejects sensitive or dangerous content: %s", (value) => {
    expect(() => assertSafeOperationsText(value, "content")).toThrow()
  })

  it("rejects overlong content", () => {
    expect(() =>
      assertSafeOperationsText("x".repeat(601), "description")
    ).toThrow(/600/)
  })

  it("accepts ordinary product and operations copy", () => {
    expect(() =>
      assertSafeOperationsText(
        "Review the validation status before the next fulfillment step.",
        "recommendation"
      )
    ).not.toThrow()
    expect(() =>
      assertSafeSpecifications({ material: "Tritan", capacity: "300 ml" })
    ).not.toThrow()
  })

  it("allows only visible specification fields and validates key-value pairs", () => {
    expect(() => assertSafeSpecifications({ recipient: "John Smith" })).toThrow(
      /unsupported field recipient/
    )
    expect(() =>
      assertSafeSpecifications({ material: "recipient John Smith" })
    ).toThrow(/personal name/)
  })
})
