declare module 'heic-convert' {
  interface Options {
    buffer: Buffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function convert(options: Options): Promise<Buffer>;
  export default convert;
}
