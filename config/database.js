 const mongoose=require('mongoose');

const dbConnection =()=>{
    //الرابط منشان يتصل ب داتا بيس
mongoose.connect(process.env.DB_URI).then((conn)=>{//هين اعمل فانكشن منشان انفذ اشي لما يصير اصال ب الداتا بيس
  console.log(`Databeas Connectes: ${conn.connection.host}`);
 })
//  .catch((err)=>//هين اذا صار خطا بالاتصال
//   {
//     console.log(`Databeas Error: ${err}`);
//     process.exit(1);
//   });
};
module.exports=dbConnection;


