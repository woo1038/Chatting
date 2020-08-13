var express = require('express');
var app = express();
var http = require('http').createServer(app);
var url = require('url');
var io = require('socket.io')(http);
let session = require('express-session');
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy;

/* body-parser 설정 */
var body = require('body-parser');
app.use(body.urlencoded({extended: false}));

/* session 설정 */
app.use(session({
  secret: '1234#$#!R@##%$#$R##$asdqw',
  resave: false,
  saveUninitialized: true
}))

/* passport 설정 */
app.use(passport.initialize());
app.use(passport.session());

/* sql 설정 */
let mysql = require('mysql');
const { Socket } = require('dgram');
const { render } = require('ejs');
let conn = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'HelloWorld'
});
conn.connect();


/* ejs 폴더 사용 */
app.set('views', './views_file');
app.set('view engine', 'ejs');
/* css 설정 */
app.use(express.static(__dirname + '/css'));



/* 로그인 */
app.get('/login', (req, res) => {
    res.render('login');
});

passport.serializeUser(function(user, done) {
  done(null, user.key);
});

passport.deserializeUser(function(id, done) {
  let sql = 'SELECT * FROM users';
    conn.query(sql, (err, users) => {
      for (let i = 0; i < users.length; i++) {
        if(users[i].key === id) {
          return done(null, users[i]);
        }
      }
    });
});

/* passport local callback */
passport.use(new LocalStrategy(
  function (username, password, done) {
    let uid = username;
    let pwd = password;
    /* 회원정보 확인 */
    let sql = 'SELECT * FROM users';
    conn.query(sql, (err, users) => {
      for (let i = 0; i < users.length; i++) {
        if(uid === users[i].id) {
          if(pwd === users[i].password) {
            done(null, users[i]);
          } else {
            done(null, false); 
          }
        }
      }
    })
  }
));

/* passport local login */
app.post('/login',
  passport.authenticate(
    'local', 
    {
      successRedirect: '/friends',
      failureRedirect: '/login',
      failureFlash: true
    }
  )
);



/* 회원가입 */
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', (req, res) => {
  let uid = req.body.username;
  let pwd = req.body.password;
  let name = req.body.displayName;
  
  let sql = 'INSERT INTO users (id, password, displayName) VALUES (?, ?, ?)';
  conn.query(sql, [uid, pwd, name],(err, users) => {
    if(err) {
      console.log(err);
    } else {
      res.redirect('/login');
    }
  })
});



/* 로그아웃 */
app.get('/logout', (req, res) => {
  req.session.destroy();
  req.logout();
  res.redirect('/login');
})



/* 메인화면 */
var async = require('async');
const { stringify } = require('querystring');
app.get('/friends', function (req, res) {
  let key = req.session.passport.user;
  let friend_key = req.session.friend_key;
  
  console.log(friend_key);

  /* 친구 추가 기능 && 친구 추가 중복 확인 */
  if (friend_key) {
    /* 친구 추가 중복 확인 sql문 */
    let sql = 'SELECT users_friends.user_key, users_friends.friend_key FROM users_friends WHERE users_friends.user_key= ?';
    conn.query(sql, [key], (err, overlap) => {

      /* 친구추가 insert sql문 */
      let insert_sql = "INSERT INTO users_friends (user_key, friend_key, friend_id, friend_displayName) VALUES (" +
                        "(SELECT users.key FROM users WHERE users.key = ?)," +
                        "(SELECT users.key FROM users WHERE users.key = ?)," +
                        "(SELECT users.id FROM users WHERE users.key = ?)," +
                        "(SELECT users.displayName FROM users WHERE users.key = ?))";

      if (overlap[0] || key === friend_key) { /* 친구가 있냐 없냐 || 자기자신 친구 추가 불가 */

          function olp(num) { /* 친구 중복 return 함수 */
            num = 0;
            for (let i = 0; i < overlap.length; i++) {
              if (overlap[i].friend_key === friend_key) {
                num++;
                return num;
              }
            }
          }
          let over = olp(0);

          if(over >= 1 || key === friend_key) {   /* 이미 등록된 친구 추가 클릭시 || || 자기자신 친구 추가 불가 */
              console.log('클릭안되요~');
          } else {  /* 친구 추가 클릭시 */
            conn.query(insert_sql, [key, friend_key, friend_key, friend_key], (err, friend) => {
              if (err) {
                console.log(err);
              }
            })
          }
      } else {
        /* 처음으로 친구 추가를 할때 */
        conn.query(insert_sql, [key, friend_key, friend_key, friend_key], (err, friend) => {
          if (err) {
            console.log(err);
          }
        })
      }
    })
  }

  /* 친구 목록 리스트 초기화 */
  async.series({
    me: function (cb) {
      let sql = "SELECT * FROM users WHERE users.key = ?";
      conn.query(sql, [key], function (error, result) {
        cb(error, result);
      })
    },
    friend: function (cb) {
      let sql = "SELECT * FROM users_friends WHERE users_friends.user_key = ?";
      conn.query(sql, [key], function (error, result) {
        cb(error, result)
      })
    }
  }, function (error, results) {
    if (!error) {
      res.render('friends', {
        me: results.me[0].displayName,
        friends: results.friend,
        hello: 'name'
      });
    }
  });
});

// 친구 검색 및 추가
app.post('/friends', (req, res) => {
  let name = req.body.name;
  let sql = 'SELECT users.displayName, users.key FROM users WHERE users.id = ?';
  conn.query(sql, [name], (err, user) => {

    // 친구 검색 함수
    function friends_list(search_friend) {
      let key = req.session.passport.user;
      async.series({
        me: function (cb) {
          let sql = "SELECT * FROM users WHERE users.key = ?";
          conn.query(sql, [key], function (error, result) {
            cb(error, result);
          })
        },
        friend: function (cb) {
          let sql = "SELECT * FROM users_friends WHERE users_friends.user_key = ?";
          conn.query(sql, [key], function (error, result) {
            cb(error, result)
          })
        }
      }, function (error, results) {
        if (!error) {
          /* 친구 검색 */
          res.render('friends', {
            me: results.me[0].displayName,
            friends: results.friend,
            hello: search_friend
          });
        }
      });
    }

    if (err) {
      console.log(err);
    }
    if (user[0] === undefined) {
      /* 검색한 아이디가 없을때 */
      friends_list('검색하신 아이디가 없습니다.');
    } else {
      /* 검색한 아이디가 있을때 */
      let my_key = req.session.passport.user;
      let sql = 'SELECT users_friends.friend_key FROM users_friends WHERE users_friends.user_key= ?';
      conn.query(sql, [my_key], (err, overlap) => {
        
        function olp(num) { /* 친구 중복 return 함수 */
          num = 0;
          for (let i = 0; i < overlap.length; i++) {
            if (overlap[i].friend_key === user[0].key) {
              num++;
              return num;
            }
          }
        }
        let over = olp(0);

        if (over >= 1) {
          friends_list('이미 등록된 아이디');
        } else {
          friends_list(user[0].displayName);
        }
      })
      req.session.friend_key = user[0].key; /* 유저들 키 정보 session */
    }
  });
});



/* 채팅창 */
app.get('/chat/:id', (req, res) => {

  /* 내 key 값과 상대방 key 값 가져오기 */
  let my_key = req.session.passport.user;
  let _url = req.url;
  let cut = _url.split('/');
  let code = my_key.toString().length;
  let me = cut[2].substr(0,code);
  let you = cut[2].substr(code,code.length);


  /* 같은 room으로 들어가기 위한 코드 정렬 */
  let arr = [me, you];
  arr.sort((a,b) => {
    return a-b;
  })
  let user1 = arr[0].toString();
  let user2 = arr[1].toString();
  let _room = user1.concat(user2);
  

  /* 서로 다른 sql 테이블에서 데이터 들고오기 위해 2개의 query를 비동기적으로 실행 */
  async.series({
    my_name: function (cb) {  /* 채팅방 자신의 정보 */
      let sql = "SELECT displayName FROM users WHERE users.key = ?";
      conn.query(sql, [me], function (error, result) {
        cb(error, result);
      })
    },
    you_name: function (cb) { /* 채팅방 상대의 정보 */
      let sql = "SELECT displayName FROM users WHERE users.key = ?";
      conn.query(sql, [you], function (error, result) {
        cb(error, result);
      })
    },
    room_msg: function (cb) { /* 채팅방 정보 */
      let sql = "SELECT * FROM room_msg WHERE room = ?";
      conn.query(sql, [_room], function (error, result) {
        cb(error, result)
      })
    }
  }, function (error, results) {
    if (!error) {
      /* 채팅에서 채팅창 들어갈시 상대방 아이디로 채팅되는 오류 수정 */
      if(parseInt(me) === my_key) { 
        res.render('chat', {
          my_key: me,
          my_displayName: results.my_name[0].displayName,
          you_displayName: results.you_name[0].displayName,
          friend_key: you,
          room: _room,
          msg: results.room_msg,
        });
      }else {
        res.render('chat', {
          my_key: you,
          my_displayName: results.you_name[0].displayName,
          you_displayName: results.my_name[0].displayName,
          friend_key: me,
          room: _room,
          msg: results.room_msg,
        });
      }
      
    }
  });
});



/* 채팅방 */
app.get('/chat_list', (req, res) => {
  let my_key = req.session.passport.user;
  let sql = 'SELECT * FROM room WHERE room.key = ?';
  conn.query(sql, [my_key], (err, result) => {
    console.log(result);
    res.render('chat_list', {
      room: result
    });
  })
});




/* 채팅방 socket 작동 */
// namespace /chat에 접속한다.
var chat = io.of('/').on('connection', function(socket) {
  console.log('connection');

  socket.on('enter', (user) => {
    var room = socket.room = user.room;

    // room에 join한다
    socket.join(room);

    socket.on('chat message', function(data){
      console.log('message from client: ', data);

      /* sql문 */
      let sql = 'INSERT INTO room_msg (room, user_key, user_displayName, user_msg) VALUES (?, ?, ?, ?)';
      conn.query(sql, [data.room, data.me, data.my_displayName, data.msg], (err, result) => {
        if(err) {
          console.log(err);
        }
      })

      /* 실시간 채팅을 통한 SQL문 */
      let room_sql = 'SELECT COUNT(room) AS room FROM room WHERE room = ?';
      conn.query(room_sql, [data.room], (err, result) => { /* room 번호를 통해 채팅방이 열렸는지 확인 sql */
        if(err) {
          console.log(err);
        }
        if(result[0].room < 2) {  /* 채팅방이 없다면 새로운 채팅방 생성 sql && user1, user2는 채팅방 안에 user 2명 */
          let user1_sql = 'INSERT INTO room (room.room, room.key, room.displayName, room.msg, room.you_key, room.you_displayName) VALUES (?, ?, ?, ?, ?, ?)';
          conn.query(user1_sql, [data.room, data.me, data.my_displayName, data.msg, data.you, data.you_displayName], (err, result) => {
            if(err) {
              console.log(err);
            }
          })
    
          let user2_sql = 'INSERT INTO room (room.room, room.key, room.displayName, room.msg, room.you_key, room.you_displayName) VALUES (?, ?, ?, ?, ?, ?)';
          conn.query(user2_sql, [data.room, data.you, data.you_displayName, data.msg, data.me, data.my_displayName], (err, result) => {
            if(err) {
              console.log(err);
            }
          })
        }else { /* 채팅방이 있다면 기존 채팅방에서 message만 변경 */
          let msg_sql = 'UPDATE room SET msg = ? WHERE room = ?';
          conn.query(msg_sql, [data.msg, data.room], (err, result) => {
            if(err) {
              console.log(err);
            }
          })
        }
      })


      // room에 join되어 있는 클라이언트에게 메시지를 전송한다
      chat.to(room).emit('chat message', {
        msg: data.msg,
        name: data.my_displayName
      });
    });
  })
});



http.listen(3000, () => {
    console.log('listening on * : 3000');
});

