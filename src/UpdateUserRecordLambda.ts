import aws from "aws-sdk";
import { sendErrorResponse, sendOKResponse } from "./lib/responseHelper";
import { isValid } from "./lib/tokenHelper";
const dynamoDB = new aws.DynamoDB({ region: process.env.AWS_REGION });

export const handler = async (event: any, context: any)=> {
    console.log(`Incoming event body: ${JSON.stringify(event.body)}`)

    try {
        const body = event.body;
        // Check if token is valid
        const decodedToken = isValid(body.token);
        
        // If valid user record data, put to DB
        let params = {
            TableName: process.env.USER_TABLE_NAME || '',
            Key: {},
            ExpressionAttributeValues: {},
            ExpressionAttributeNames: {},
            UpdateExpression: "",
            ReturnValues: "ALL_NEW"
        };

        const idAttributeName = 'emailAddress'
        params["Key"][idAttributeName] = decodedToken["data"][idAttributeName];
    
        let prefix = "set ";
        let attributes = Object.keys(body.updateObject);
        for (let i=0; i<attributes.length; i++) {
            let attribute = attributes[i];
            if (attribute != idAttributeName) {
                params["UpdateExpression"] += prefix + "#" + attribute + " = :" + attribute;
                params["ExpressionAttributeValues"][":" + attribute] = body.updateObject[attribute];
                params["ExpressionAttributeNames"]["#" + attribute] = attribute;
                prefix = ", ";
            }
        }

        params.Key = aws.DynamoDB.Converter.marshall(params.Key)
        params.ExpressionAttributeValues = aws.DynamoDB.Converter.marshall(params.ExpressionAttributeValues)
        console.log(`Params after running through loop ${JSON.stringify(params)}`)
    
        const updatedItem = await dynamoDB.updateItem(params).promise();

        console.log(`Updated item: ${JSON.stringify(updatedItem)}`)
        return sendOKResponse('User updated successfully!')

    } catch (error) {
        console.error(error)
        return sendErrorResponse('Failed to update user data')
    }
}
