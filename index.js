import * as fs from 'fs';
import {readFile} from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import {fileURLToPath} from 'url';
import {Promise as NodeID3Promise} from 'node-id3';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'https://kazky.suspilne.media';
const DIR_MEDIA_NAME = 'media';
const DIR_MEDIA = path.join(__dirname, DIR_MEDIA_NAME);
const DIR_TMP = path.join(__dirname, 'tmp');
const ALBUM_NAME = 'UA:Казки';

async function fetchList() {
  return new Promise((resolve, reject) => {
    https.get(URL + '/index.json', (resp) => {
      let data = '';

      resp.on('data', (chunk) => {
        data += chunk;
      });

      resp.on('end', () => {
        resolve(JSON.parse(data));
      });

    }).on('error', (error) => {
      reject(error)
    });
  });
}

async function mkdir(dir) {
  return new Promise((resolve, reject) => {
    fs.mkdir(dir, (error) => {
      if (error) {
        reject(error);
      }

      resolve();
    });
  });
}

async function rmdir(dir) {
  return new Promise((resolve, reject) => {
    fs.rm(dir, {recursive: true}, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function downloadFile(url, dest) {
  const file = fs.createWriteStream(dest);

  return new Promise((resolve, reject) => {
    https.get(url, response => {
      response.pipe(file);

      file.on('finish', file.close.bind(file, resolve));
    }).on('error', error => {
      fs.unlink(dest, error => {
        if (error) {
          reject(error);
        }
      });

      reject(error);
    });
  });
}

async function downloadMedia({name, auth, image, song, url, id}) {
  const imageUrl = [URL, image].join('/');
  const imageDest = path.join(DIR_TMP, name + '.jpg');
  const imageResizedDest = path.join(DIR_TMP, name + '_scaled.jpg');
  const mp3Url = [URL, song].join('/');
  const mp3Dest = path.join(DIR_MEDIA, name + '.mp3');

  console.log('Downloading: ' + url + ' - ' + name);

  await downloadFile(imageUrl, imageDest);
  await downloadFile(mp3Url, mp3Dest);

  const imageBuffer = await sharp(imageDest)
  // await sharp(imageDest)
    .resize(300, 300, {
      kernel: sharp.kernel.lanczos3,
      fit: 'cover'
    })
    .jpeg({
      quality: 100,
      progressive: false,
      force: true
    })
    // .toFile(imageResizedDest);
    .toBuffer();

  // const imageBuffer = await readFile(imageResizedDest);

  const tags = {
    title: name,
    artist: auth,
    image: {
      mime: 'jpeg',
      type: {
        id: 3,
        name: 'Front Cover'
      },
      imageBuffer: imageBuffer
    },
    album: ALBUM_NAME,
    copyright: 'UA:Казки, проект Суспільного Мовлення',
    copyrightUrl: 'https://kazky.suspilne.media/',
    language: 'ukr',
    trackNumber: Number(url),
  };

  await NodeID3Promise.update(tags, mp3Dest);

  return true;
}

async function batch(jobs, limit = 5) {
  if (!jobs.length) {
    throw new Error('No jobs to execute');
  }

  let jobsRunning = 0;

  function runJobs(jobs) {
    return new Promise((resolve, reject) => {
      const job = jobs.shift();

      jobsRunning++;

      if (jobsRunning < limit) {
        runJobs(jobs);
      }

      job()
        .catch(error => {
          reject(error);
        })
        .finally(() => {
          jobsRunning--;

          if (jobs.length) {
            runJobs(jobs);
          } else {
            resolve();
          }
        });
    });
  }

  return runJobs(jobs);
}

// App code

// Remove tmp directory if exists
try {
  await rmdir(DIR_TMP);
} catch (e) {
  if (e.code !== 'ENOENT') {
    throw e;
  }
}

// Re-create tmp directory
try {
  await mkdir(DIR_TMP);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}

// Remove media directory if exists
try {
  await rmdir(DIR_MEDIA);
} catch (e) {
  if (e.code !== 'ENOENT') {
    throw e;
  }
}

// Re-create media directory
try {
  await mkdir(DIR_MEDIA);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}

try {
  const list = await fetchList();
  const keys = Object.keys(list);
  const jobs = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    jobs.push(downloadMedia.bind(null, list[key]));
  }

  batch(jobs);
} catch (e) {
  debugger;
}
