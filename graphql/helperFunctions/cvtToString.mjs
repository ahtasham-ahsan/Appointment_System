const convertStringToObjectId = (user) => {
  let userId = "";
  Object.keys(user).forEach(key => {
    if (user[key]) userId += user[key];
  });
  return userId;
}

export {convertStringToObjectId}