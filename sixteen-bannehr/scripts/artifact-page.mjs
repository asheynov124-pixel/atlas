#!/usr/bin/env node
// Turns dist-artifact/index.html into the page the claude.ai artifact viewer wants: the
// viewer supplies <!doctype>, <html>, <head> and <body> itself, so the page is only its
// <title>, <style>, stylesheet and script tags, and the #root the app mounts into.
// Writes dist-artifact/sixteen-bannehr.html, copies the photos from `npm run import-photos`
// beside it (the artifact build skips public/), and lists the files to publish.

import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const dir = 'dist-artifact';
const html = await readFile(`${dir}/index.html`, 'utf8');

const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style>[\s\S]*?<\/style>/g);
const links = pick(/<link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*>/g);
const scripts = pick(/<script\b[^>]*type="module"[^>]*><\/script>/g);

if (!title.length || !scripts.length) throw new Error('index.html is missing its <title> or module script.');

const page = [...title, ...styles, ...links, '<div id="root"></div>', ...scripts].join('\n') + '\n';
await writeFile(`${dir}/sixteen-bannehr.html`, page);

await rm(`${dir}/photos`, { recursive: true, force: true });
if (existsSync('public/photos')) await cp('public/photos', `${dir}/photos`, { recursive: true });

const list = async (sub) =>
  existsSync(`${dir}/${sub}`) ? (await readdir(`${dir}/${sub}`, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()) : [];
const assets = await list('assets');
const photos = (await list('photos')).filter((e) => e.name.endsWith('.webp'));
console.log(`Wrote ${dir}/sixteen-bannehr.html with ${assets.length} files in assets/ and ${photos.length} photos in photos/.`);
