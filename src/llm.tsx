

// const result = streamText({
//     model: transformersJS("onnx-community/gemma-4-E2B-it-ONNX"),
//     prompt: "Invent a new holiday and describe its traditions.",
// });

// for await (const textPart of result.textStream) {
//     console.log(textPart);
// }

// import {
//     AutoProcessor,
//     Gemma4ForConditionalGeneration
// } from "@huggingface/transformers";

// Load processor and model
// const model_id = "onnx-community/gemma-4-E2B-it-ONNX";
// const processor = await AutoProcessor.from_pretrained(model_id);
// const model = await Gemma4ForConditionalGeneration.from_pretrained(model_id, {
//     dtype: "q4f16",
//     device: "webgpu",
//     progress_callback: (info) => {
//         if (info.status === "progress_total") {
//             console.log(`Loading model: ${info.progress}%`);
//         }
//     },
// });


// // Prepare prompt
// const messages = [
//     {
//         role: "user",
//         content: [
//             { type: "image" },
//             { type: "audio" },
//             {
//                 type: "text",
//                 text: "Describe this image in detail and transcribe this audio verbatim.",
//             },
//         ],
//     },
// ];
// const prompt = processor.apply_chat_template(messages, {
//     enable_thinking: false,
//     add_generation_prompt: true,
// });

// // Prepare inputs
// const image = await load_image("https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/artemis.jpeg");
// const audio = await read_audio("https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav");
// const inputs = await processor(prompt, image, audio, {
//     add_special_tokens: false,
// });

// 準備訊息
// const messages = [
//     { role: "system", content: "你是一個專業的助理。" },
//     { role: "user", content: "你好，請自我介紹。" }
// ];
// // 將對話樣板應用於訊息
// const prompt = processor.apply_chat_template(messages, {
//     add_generation_prompt: true, // 核心：增加引導助手回覆的標記
// });

// // 編碼輸入
// const inputs = await processor(prompt);
// // 生成回覆
// const outputs = await model.generate({
//     ...inputs,
//     max_new_tokens: 512,
// }) as any;

// // Decode output
// const decoded = processor.batch_decode(
//     outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
//     { skip_special_tokens: true },
// );
// console.log(decoded[0]);

// // 解碼回覆
// const decoded = processor.batch_decode(
//     outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
//     { skip_special_tokens: true }
// );
// console.log("助理回覆：", decoded[0]);

// // 編碼輸入
// const inputs = await processor(prompt);


// // Generate output
// const outputs = await model.generate({
//     ...inputs,
//     max_new_tokens: 512,
//     do_sample: false,
//     streamer: new TextStreamer(processor.tokenizer, {
//         skip_prompt: true,
//         skip_special_tokens: false,
//         // callback_function: (text) => { /* Do something with the streamed output */ },
//     }),
// });

// // Decode output
// const decoded = processor.batch_decode(
//     outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
//     { skip_special_tokens: true },
// );
// console.log(decoded[0]);