const jsonServer = require("json-server");
const server = jsonServer.create();
const db = require("./db");
const router = jsonServer.router(db);
const multer = require("multer");
const path = require("path");

// const db = require("db.json");
// server.use(cors());

const middlewares = jsonServer.defaults({
  watch: true,
  // noCors: true,
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log(__dirname);
    cb(null, path.join(__dirname, "public/upload"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

server.use(middlewares);
server.use(jsonServer.bodyParser);
server.all(
  "/upload/avatar",
  upload.single("avatar"),
  function (req, res, next) {
    console.log(req.file);
    console.log(req.body);
    res.json({ img: `/upload/${req.file.filename}` });
  }
);

/**
 * 使用json-server托管db.json作为数据库使用。
 *    1、当请求为db.json里的数据的时候，使用json-server自动生成数据进行返回。
 *
 * 但是json-server使用多对多表链接不方便，这个时候我们需要单独对many-to-many的表进行处理。
 *    当使用many-to-many表链接查询的时候，需要手动进行数据处理，并且返回对应的数据
 */
//手动处理many-to-many的情况：
//get roles by username ids
server.get("/api/roles", function (req, res, next) {
  const ids = req.query.ids;

  let user_roleList = ids.reduce((pre, cur) => {
    return [...pre, ...db.user_role.filter((u) => u.userId == cur)];
  }, []);
  let roleList = user_roleList.reduce((pre, cur) => {
    return [...pre, ...db.roles.filter((r) => r.id == cur.roleId)];
  }, []);
  res.jsonp({
    roleList,
  });
});
//根据角色返回对应并且格式化好的权限
server.get("/api/permissions", (req, res, next) => {
  const ids = req.query.ids;
  let role_permissionList = ids.reduce((pre, cur) => {
    return [...pre, ...db.role_permission.filter((r) => r.roleId == cur)];
  }, []);
  let permissionList = role_permissionList.reduce((pre, cur) => {
    return [...pre, ...db.permissions.filter((p) => p.id == cur.permissionId)];
  }, []);

  res.json({
    permissionList,
  });
});

server.get("/api/permissions_treeview", (req, res, next) => {
  let permissionList = formatPermissionList(db.permissions);
  res.json({
    permissionList,
  });
});

server.post("/api/userlogin", (req, res, next) => {
  let { username, password } = req.body;
  // console.log(req.body);
  let user = db.users.find((item) => {
    return item.username == username && item.password == password;
  });
  if (user) {
    //登录成功拿到用户角色，权限
    //拿到关联用户的角色id
    let roleIdsList = db.user_role.reduce((pre, cur) => {
      if (cur.userId == user.id) {
        pre.push(cur.roleId);
      }
      return pre;
    }, []);

    //根据关联的角色ID拿到这些角色所对应的所有权限ID
    let permissionIdsAllList = db.role_permission.reduce((pre, cur) => {
      if (roleIdsList.indexOf(cur.roleId) >= 0) {
        pre.push(cur.permissionId);
      }
      return pre;
    }, []);
    console.log(permissionIdsAllList);
    //对多个角色都有的权限去重
    let permissionIdsList = [...new Set(permissionIdsAllList)];
    //根据权限ID，拿到所有的权限
    let userPermissionList = permissionIdsList.reduce((pre, cur) => {
      pre.push(db.permissions.find((u) => u.id == cur));
      return pre;
    }, []);
    console.log(userPermissionList);
    let userPagePermissionList = userPermissionList.filter((u) => u.type == 1);
    let btnPermission = userPermissionList.filter((u) => u.type == 2);
    //格式化permissionList
    /**
     {
        id: 1,
        name: "用户管理",
        code: "user",
        path: "/user",
        type: 1,
        children: [
          {
            id: 5,
            name: "用户列表",
            code: "user.list",
            path: "/user/list",
            type: 1,
            children: [],
          },
        ],
      },
     */

    let result = formatPermissionList(userPagePermissionList);
    console.log(result);
    // user.allPermission = result;
    user = { ...user, allPermission: result, btnPermission };
    res.jsonp({
      user,
      code: 1,
      msg: "login success",
      token: Date.now() + "",
    });
  } else {
    res.json({
      code: 0,
      msg: "Username or password is wrong!",
    });
  }
  // next();
});
server.put("/api/user_role/:userId", (req, res, next) => {
  let userId = +req.params.userId;
  let roleIdList = req.body.selectRoles;
  console.log(roleIdList);
  let newRoles = roleIdList.map((u, index) => {
    return { id: Date.now() + index, userId, roleId: u };
  });
  console.log(newRoles);
  db.user_role = db.user_role
    .filter((u) => u.userId != userId)
    .concat(newRoles);
  res.json({
    code: 1,
  });
});
server.put("/api/role_permission/:roleId", (req, res, next) => {
  let roleId = +req.params.roleId;
  let permissionIdList = req.body.selectPermissions;
  let newPermissions = permissionIdList.map((u, index) => {
    return { id: Date.now() + index, roleId, permissionId: u };
  });
  db.role_permission = db.role_permission
    .filter((u) => u.roleId != roleId)
    .concat(newPermissions);
  res.json({
    code: 1,
  });
});
//删除用户表和用户角色表
server.delete("/api/users/:id", (req, res, next) => {
  let userId = req.params.id;
  console.log(userId);
  db.user_role = db.user_role.filter((u) => u.userId != userId);
  db.users = db.users.filter((u) => u.id != userId);
  res.json({
    code: 1,
  });
});
//删除角色（需要删掉，user_role, role, role_permission）
server.delete("/api/roles/:id", (req, res, next) => {
  let roleId = req.params.id;
  console.log(roleId);
  db.user_role = db.user_role.filter((u) => u.roleId != roleId);
  db.roles = db.roles.filter((u) => u.id != roleId);
  db.role_permission = db.role_permission.filter((u) => u.roleId != roleId);
  res.json({
    code: 1,
  });
});

//删除角色
server.get("/test", (req, res, next) => {
  // let permissionList = JSON.parse(JSON.stringify(db.permissions))
  //   .map((u) => {
  //     u.children = [];
  //     return u;
  //   })
  //   .sort((a, b) => a.pId - b.pId);

  let result = formatPermissionList(db.permissions);
  res.json({ data: result });
});
// Use default router
server.use(router);
server.listen(3004, () => {
  console.log("JSON Server is running, port number is: 3004");
});

function formatPermissionList(permissionList) {
  permissionList = JSON.parse(JSON.stringify(permissionList))
    .map((u) => {
      u.children = [];
      return u;
    })
    .sort((a, b) => a.pId - b.pId);
  let res = [];
  res.push(...permissionList.filter((p) => p.pId == 0));

  let arr = permissionList.filter((p) => p.pId != 0);
  arr.forEach((val) => {
    formatPermissionListByParentId(val, res);
  });
  return res;
}

function formatPermissionListByParentId(item, res) {
  let isFind = false;
  for (let i = 0; i < res.length; i++) {
    if (res[i].id === item.pId) {
      isFind = true;
      res[i].children.push(item);
      return;
    }
  }
  if (!false) {
    for (let i = 0; i < res.length; i++) {
      if (res[i].children.length > 0) {
        formatPermissionListByParentId(item, res[i].children);
      } else {
        if (res[i].id === item.pId) {
          res[i].children.push(item);
          return;
        }
      }
    }
  }
}
