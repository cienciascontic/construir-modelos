/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let GoogleDriveIO;
module.exports = (GoogleDriveIO = (function() {
  GoogleDriveIO = class GoogleDriveIO {
    static initClass() {

      this.prototype.APP_ID  = '1095918012594';
      this.prototype.DEVELOPER_KEY = 'AIzaSyAUobrEXqtbZHBvr24tamdE6JxmPYTRPEA';
      this.prototype.CLIENT_ID = '1095918012594-svs72eqfalasuc4t1p1ps1m8r9b8psso.apps.googleusercontent.com';
      this.prototype.SCOPES = 'https://www.googleapis.com/auth/drive';

      this.prototype.authorized = false;

      this.prototype.token = null;
    }

    authorize(immediate, callback) {
      if (this.token) {
        return callback(null, this.token);
      } else {
        const args = {
          'client_id': this.CLIENT_ID,
          'scope': this.SCOPES,
          'immediate': immediate || false
        };
        return gapi.auth.authorize(args, token => {
          if (token && !token.error) {
            this.token = token;
          }
          if (callback) {
            const err = (!token ?
              'Unable to authorize'
            : token.error ?
              token.error
            :
              null
            );
            this.authorized = err === null;
            return callback(err, token);
          }
        });
      }
    }

    makeMultipartBody(parts, boundary) {
      return ((Array.from(parts).map((part) =>
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${part}`)
      ).join('')) + `\r\n--${boundary}--`;
    }

    sendFile(fileSpec, contents, callback) {
      const boundary = '-------314159265358979323846';
      const metadata = JSON.stringify({
        title: fileSpec.fileName,
        mimeType: 'application/json'
      });

      const [method, path] = Array.from(fileSpec.fileId ?
        ['PUT', `/upload/drive/v2/files/${fileSpec.fileId}`]
      :
        ['POST', '/upload/drive/v2/files']);

      const request = gapi.client.request({
        path,
        method,
        params: {uploadType: 'multipart', alt: 'json'},
        headers: {'Content-Type': `multipart/mixed; boundary="${boundary}"`},
        body: this.makeMultipartBody([metadata, contents], boundary)
      });

      return request.execute(function(file) {
        if (callback) {
          if (file) {
            return callback(null, file);
          } else {
            return callback('Unabled to upload file');
          }
        }
      });
    }

    upload(fileSpec, contents, callback) {
      return this.authorize(this.authorized, err => {
        if (!err) {
          return gapi.client.load('drive', 'v2', () => this.sendFile(fileSpec, contents, callback));
        } else {
          return callback(`No authorization. Upload failed for file: ${fileSpec.fileName}`);
        }
      });
    }

    makePublic(fileId) {
      const perms = {
        'value': '',
        'type': 'anyone',
        'role': 'reader'
      };

      const request = gapi.client.drive.permissions.insert({
        'fileId': fileId,
        'resource': perms
      });

      return request.execute(function(resp) {
        if (resp.code && (resp.code !== 200)) {
          return alert("there was a problem sharing your document.");
        }
      });
    }

    download(fileSpec, callback) {
      return this.authorize(this.authorized, (err, token) => {
        if (err) {
          return callback(err);
        } else {
          return gapi.client.load('drive', 'v2', () => {
            const request = gapi.client.drive.files.get({
              fileId: fileSpec.id});
            return request.execute(file => {
              if ((file != null ? file.downloadUrl : undefined)) {
                return this._downloadFromUrl(file.downloadUrl, token, callback);
              } else {
                return callback("Unable to get download url");
              }
            });
          });
        }
      });
    }

    downloadFromUrl(url, callback, authorize) {
      if (authorize == null) { authorize = true; }
      if (authorize) {
        return this.authorize(this.authorized, (err, token) => {
          return this._downloadFromUrl(url, token, callback);
        });
      } else {
        return this._downloadFromUrl(url, null, callback);
      }
    }

    _downloadFromUrl(url, token, callback) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token.access_token}`);
      }
      xhr.onload = function() {
        let json;
        try {
          json = JSON.parse(xhr.responseText);
        } catch (e) {
          callback(e);
          return;
        }
        return callback(null, json);
      };
      xhr.onerror = () => callback(`Unable to download ${url}`);
      return xhr.send();
    }

    filePicker(callback) {
      return this.authorize(this.authorized, function(err, token) {
        if (err) {
          return callback(err);
        } else {
          return gapi.load('picker', { callback() {
            const pickerCallback = (data, etc) => callback(null, data.action === 'picked' ? data.docs[0] : null);
            const picker = new google.picker.PickerBuilder()
              .addView(google.picker.ViewId.DOCS)
              .setOAuthToken(token.access_token)
              .setCallback(pickerCallback)
              .build();
            return picker.setVisible(true);
          }
        }
          );
        }
      });
    }
  };
  GoogleDriveIO.initClass();
  return GoogleDriveIO;
})());
