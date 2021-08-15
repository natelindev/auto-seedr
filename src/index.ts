import {
  app,
  clipboard,
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  Notification,
  shell,
  Tray,
} from 'electron';
import storage from 'electron-json-storage';
import FormData from 'form-data';
import fetch from 'node-fetch';
import path from 'path';

const assetsDir = path.resolve(__dirname, 'assets');

const getToken = async () => {
  const response = await fetch(
    `https://www.seedr.cc/api/device/authorize?device_code=${storage.getSync(
      'deviceToken'
    )}&client_id=seedr_xbmc`
  );
  const data = await response.json();
  const token = data.access_token;
  return token;
};

const addMagnet = async (magnet: string) => {
  const token = await getToken();
  const formData = new FormData();
  formData.append('access_token', token);
  formData.append('func', 'add_torrent');
  formData.append('torrent_magnet', magnet);

  await fetch('https://www.seedr.cc/oauth_test/resource.php', {
    method: 'post',
    headers: formData.getHeaders(),
    body: formData,
  });
};

const deleteFolder = async (id: number) => {
  const token = await getToken();
  const formData = new FormData();
  formData.append('access_token', token);
  formData.append('func', 'delete');
  formData.append(
    'delete_arr',
    JSON.stringify([
      {
        type: 'folder',
        id: id,
      },
    ])
  );

  const response = await fetch('https://www.seedr.cc/oauth_test/resource.php', {
    method: 'post',
    headers: formData.getHeaders(),
    body: formData,
  });
  if (response.ok) {
    new Notification({
      title: 'Folder Deleted',
      body: `${id} has been deleted`,
    }).show();
  }
};

const getFile = async (
  id: number
): Promise<{
  url: string;
  name: string;
  result: boolean;
}> => {
  const token = await getToken();
  const data = new FormData();
  data.append('access_token', token);
  data.append('func', 'fetch_file');
  data.append('folder_file_id', id);

  const response = await fetch('https://www.seedr.cc/oauth_test/resource.php', {
    method: 'post',
    headers: data.getHeaders(),
    body: data,
  });
  return response.json();
};

const getFolder = async (
  id: number
): Promise<{
  result: boolean;
  archive_id: number;
  archive_url: string;
}> => {
  const token = await getToken();
  const data = new FormData();
  data.append('access_token', token);
  data.append('func', 'create_empty_archive');
  data.append('archive_arr', JSON.stringify([{ type: 'folder', id }]));
  const response = await fetch('https://www.seedr.cc/oauth_test/resource.php', {
    method: 'post',
    headers: data.getHeaders(),
    body: data,
  });
  return response.json();
};

type Folder = {
  id: number;
  name: string;
  fullname: string;
  size: number;
  play_audio: boolean;
  play_video: boolean;
  is_shared: boolean;
  last_update: string;
};
const getFolders = async (): Promise<Folder[]> => {
  const token = await getToken();
  const response = await fetch(
    `https://www.seedr.cc/api/folder?access_token=${token}`
  );
  if (response.ok) {
    const data = await response.json();
    return data.folders;
  }
  return [];
};

const getOptions = async (
  menuTemplate: Array<MenuItemConstructorOptions | MenuItem>
) => {
  return (await getFolders()).map((folder) => ({
    label: folder.name,
    id: `file-${folder.id}`,
    submenu: [
      {
        label: 'download',
        click: async () => {
          shell.openExternal((await getFolder(folder.id)).archive_url);
        },
      },
      {
        label: 'copy url',
        click: async () => {
          clipboard.writeText((await getFolder(folder.id)).archive_url);
        },
      },
      {
        label: 'delete',
        click: async () => {
          await deleteFolder(folder.id);
          menuTemplate = menuTemplate.filter(
            (item) => item.id !== `file-${folder.id}`
          );
        },
      },
    ],
  }));
};

let tray: Tray;

app.on('ready', () => {
  tray = new Tray(path.resolve(assetsDir, 'seedrTemplate.png'));

  let MenuTemplate: Array<MenuItemConstructorOptions | MenuItem> = [
    {
      label: 'auto-seedr v1.0.0',
      type: 'normal',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: `configure device token`,
      click: async () => {
        const response = await fetch(
          'https://www.seedr.cc/api/device/code?client_id=seedr_xbmc'
        );
        const data = await response.json();
        const deviceToken = data.device_code;
        const userToken = data.user_code;
        clipboard.writeText(userToken);
        shell.openExternal('https://www.seedr.cc/devices');

        storage.set('deviceToken', deviceToken, () =>
          dialog.showMessageBox({
            type: 'info',
            title: 'auto-seedr',
            message:
              "Please add the token below, it's already copied to your clipboard",
            detail: `${userToken}`,
          })
        );
      },
    },
    {
      label: 'add magnet from clipboard',
      click: async () => {
        const magnet = clipboard.readText();
        await addMagnet(magnet);
        new Notification({
          title: 'Added magnet',
        }).show();
      },
    },
    {
      label: 'refresh',
      click: async () => {
        MenuTemplate = [
          ...MenuTemplate.slice(0, -1).filter((item) =>
            item.id ? !item.id.includes('file-') : true
          ),
          ...(await getOptions(MenuTemplate)),
          ...MenuTemplate.slice(-1),
        ];
      },
    },
    {
      label: 'exit',
      click: function () {
        app.exit();
      },
    },
  ];

  (async () => {
    MenuTemplate = [
      ...MenuTemplate.slice(0, -1),
      ...(await getOptions(MenuTemplate)),
      ...MenuTemplate.slice(-1),
    ];
  })();

  const getMenu = async () => {
    return Menu.buildFromTemplate(MenuTemplate);
  };

  tray.on('click', async () => {
    tray.popUpContextMenu(await getMenu());
  });
});

app.dock.hide();
