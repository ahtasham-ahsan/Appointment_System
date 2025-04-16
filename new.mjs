import { z } from "zod";


function validateDate(date){
    const dateSchema = z
    .string()
    .refine(val => !isNaN(Date.parse(val)), {
      message: "Invalid date format",
    });

    const res = dateSchema.safeParse(date);
    console.log(res);
    if (!res.success) {
        console.log("Invalid date format");
        return false;
    }
  }
    validateDate("2023-10-01");
    validateDate("invalid-date")

function validateEmail(email) {
    const emailSchema = z.string().email();
    const res =  emailSchema.safeParse(email);
    // console.log(res);
  }
  
  let participants = ["tset@gmail.com", "test@gmail.com"]
    participants.map(email => {
    validateEmail(email);
  }
  );
  console.log(participants);