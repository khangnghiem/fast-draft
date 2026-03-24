import { refineSelectedNodes } from "./fd-vscode/src/ai-touch.ts";
(async () => {
    const globalFetch = global.fetch;
    global.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: "This is just some text" }] } }]
        })
    }) as any;

    const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
    console.log(result);
    global.fetch = globalFetch;
})();
