import { test, expect } from "vitest";

test("a", () => {
    let refined = "This is just some text";
    let m = refined.match(/\b(rect|ellipse|text|group|path)\b/);
    console.log(m);
});
