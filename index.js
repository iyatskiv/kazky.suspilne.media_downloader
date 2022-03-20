import * as fs from 'fs';
import {readFile} from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import {fileURLToPath} from 'url';
import {Promise as NodeID3Promise} from 'node-id3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'https://kazky.suspilne.media';
const DIR_MEDIA_NAME = 'media';
const DIR_MEDIA = path.join(__dirname, DIR_MEDIA_NAME);
const DIR_TMP = path.join(__dirname, 'tmp');

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

      file.on('finish', () => {
        file.close(() => {
          resolve();
        });
      });
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
  // {
  //   "name": "ЗАЄЦЬ ХВАЛЬКО",
  //   "auth": "АНДРІЙ ХЛИВНЮК, ВОКАЛІСТ ГУРТУ “БУМБОКС”",
  //   "image": "tales/img/01-min.jpg",
  //   "song": "tales/songs/01.mp3",
  //   "url": "1",
  //   "id": "1"
  // }

  const imageUrl = [URL, image].join('/');
  const imageDest = path.join(DIR_TMP, name + '.jpg');
  const mp3Url = [URL, song].join('/');
  const mp3Dest = path.join(DIR_MEDIA, name + '.mp3');

  console.log('Downloading: ' + name);

  await downloadFile(imageUrl, imageDest);
  await downloadFile(mp3Url, mp3Dest);

  const imageBuffer = await readFile(imageDest);

  const tags = {
    title: name,
    artist: auth,
    image: {
      mime: "jpeg",
      type: {
        id: 3,
        name: "front cover"
      },
      // description: String,
      imageBuffer: imageBuffer
    },
    // raw: {
    //   TIT2: name,
    //   TPE1: auth,
    //   APIC: imageBuffer
    // }
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

  // batch([
  //   downloadMedia.bind(null, list['1']),
  //   downloadMedia.bind(null, list['2']),
  //   downloadMedia.bind(null, list['3']),
  //   downloadMedia.bind(null, list['4']),
  //   downloadMedia.bind(null, list['5']),
  //   downloadMedia.bind(null, list['6']),
  //   downloadMedia.bind(null, list['7']),
  //   downloadMedia.bind(null, list['8'])
  // ]);
} catch (e) {
  debugger;
}
