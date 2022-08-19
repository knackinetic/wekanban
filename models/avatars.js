import { Meteor } from 'meteor/meteor';
import { FilesCollection } from 'meteor/ostrio:files';
import { formatFleURL } from 'meteor/ostrio:files/lib';
import { isFileValid } from './fileValidation';
import { createBucket } from './lib/grid/createBucket';
import fs from 'fs';
import path from 'path';
import FileStoreStrategyFactory, { FileStoreStrategyFilesystem, FileStoreStrategyGridFs, STORAGE_NAME_FILESYSTEM } from '/models/lib/fileStoreStrategy';

let avatarsUploadExternalProgram;
let avatarsUploadMimeTypes = [];
let avatarsUploadSize = 72000;
let avatarsBucket;
let storagePath;

if (Meteor.isServer) {
  if (process.env.AVATARS_UPLOAD_MIME_TYPES) {
    avatarsUploadMimeTypes = process.env.AVATARS_UPLOAD_MIME_TYPES.split(',');
    avatarsUploadMimeTypes = avatarsUploadMimeTypes.map(value => value.trim());
  }

  if (process.env.AVATARS_UPLOAD_MAX_SIZE) {
    avatarsUploadSize = parseInt(process.env.AVATARS_UPLOAD_MAX_SIZE);

    if (isNaN(avatarsUploadSize)) {
      avatarsUploadSize = 0
    }
  }

  if (process.env.AVATARS_UPLOAD_EXTERNAL_PROGRAM) {
    avatarsUploadExternalProgram = process.env.AVATARS_UPLOAD_EXTERNAL_PROGRAM;

    if (!avatarsUploadExternalProgram.includes("{file}")) {
      avatarsUploadExternalProgram = undefined;
    }
  }

  avatarsBucket = createBucket('avatars');
  storagePath = path.join(process.env.WRITABLE_PATH, 'avatars');
}

const fileStoreStrategyFactory = new FileStoreStrategyFactory(FileStoreStrategyFilesystem, storagePath, FileStoreStrategyGridFs, avatarsBucket);

Avatars = new FilesCollection({
  debug: false, // Change to `true` for debugging
  collectionName: 'avatars',
  allowClientCode: true,
  storagePath() {
    const ret = fileStoreStrategyFactory.storagePath;
    return ret;
  },
  onBeforeUpload(file) {
    if (file.size <= avatarsUploadSize && file.type.startsWith('image/')) {
      return true;
    }
    return 'avatar-too-big';
  },
  onAfterUpload(fileObj) {
    // current storage is the filesystem, update object and database
    Object.keys(fileObj.versions).forEach(versionName => {
      fileObj.versions[versionName].storage = STORAGE_NAME_FILESYSTEM;
    });

    Avatars.update({ _id: fileObj._id }, { $set: { "versions": fileObj.versions } });

    const isValid = Promise.await(isFileValid(fileObj, avatarsUploadMimeTypes, avatarsUploadSize, avatarsUploadExternalProgram));
    const user = Users.findOne(fileObj.userId);

    if (isValid) {
      user.setAvatarUrl(`${formatFleURL(fileObj)}?auth=false&brokenIsFine=true`);
    } else {
      user.setAvatarUrl('');
      Avatars.remove(fileObj._id);
    }
  },
  interceptDownload(http, fileObj, versionName) {
    const ret = fileStoreStrategyFactory.getFileStrategy(fileObj, versionName).interceptDownload(http, this.cacheControl);
    return ret;
  },
  onAfterRemove(files) {
    files.forEach(fileObj => {
      Object.keys(fileObj.versions).forEach(versionName => {
        fileStoreStrategyFactory.getFileStrategy(fileObj, versionName).onAfterRemove();
      });
    });
  },
});

function isOwner(userId, doc) {
  return userId && userId === doc.userId;
}

if (Meteor.isServer) {
  Avatars.allow({
    insert: isOwner,
    update: isOwner,
    remove: isOwner,
    fetch: ['userId'],
  });

  Meteor.startup(() => {
    const storagePath = fileStoreStrategyFactory.storagePath;
    if (!fs.existsSync(storagePath)) {
      console.log("create storagePath because it doesn't exist: " + storagePath);
      fs.mkdirSync(storagePath, { recursive: true });
    }
  });
}

export default Avatars;
