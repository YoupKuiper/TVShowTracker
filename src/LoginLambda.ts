import aws from "aws-sdk";
import { DynamoDBClient } from "./DynamoDBClient";
import { isCorrectPassword } from "./lib/passwordHelper";
import {
	sendErrorResponse,
	sendOKResponse,
	sendTokenErrorResponse,
	sendVerifyEmailFirstResponse,
} from "./lib/responseHelper";
import { isValid, signTokenFor } from "./lib/tokenHelper";
const dynamoDB = new aws.DynamoDB({ region: process.env.AWS_REGION });

export const handler = async (event: any, context: any) => {
	console.log(`Incoming event body: ${JSON.stringify(event.body)}`);

	const parsedEvent = JSON.parse(event.body);
	console.log(`Parsed event body: ${JSON.stringify(parsedEvent)}`);

	try {
		const isLoginWithTokenRequest = !!parsedEvent.token;
		if (isLoginWithTokenRequest) {
			// Check if valid token
			const decodedToken = isValid(parsedEvent.token);
			const emailAddress = decodedToken["data"]["emailAddress"];
			const userDto = await new DynamoDBClient().getUserByEmailAddress(emailAddress);
			if (!userDto) {
				return sendErrorResponse({ message: "User not found" });
			}
			const { wantsEmailNotifications, wantsMobileNotifications } = userDto;
			return sendOKResponse({
				emailAddress,
				wantsEmailNotifications,
				wantsMobileNotifications,
			});
		}

		const { password, emailAddress } = parsedEvent;
		console.log(`Email address: ${emailAddress}`);

		// Get user from DynamoDB by EmailAddress
		const userDto = await dynamoDB
			.getItem({
				Key: aws.DynamoDB.Converter.marshall({
					emailAddress: emailAddress,
				}),
				TableName: process.env.TV_SHOWS_TABLE_NAME || "",
			})
			.promise();

		if (!userDto.Item) {
			console.log(`Invalid credentials`);
			return sendErrorResponse({ message: "Invalid credentials" });
		}

		const { hashedPassword, unsubscribeEmailToken, resetPasswordToken, ...user } =
			aws.DynamoDB.Converter.unmarshall(userDto.Item);

		// Check if password is correct
		if (await isCorrectPassword(password, hashedPassword)) {
			if (!user.emailAddressVerified) {
				return sendVerifyEmailFirstResponse();
			}
			// Endcode a JWT token and return
			if (process.env.JWT_SECRET) {
				const token = signTokenFor(
					user.emailAddress,
					user.wantsEmailNotifications,
					user.wantsMobileNotifications
				);

				console.log(`Login successful`);
				return sendOKResponse({
					token,
					emailAddress: user.emailAddress,
					wantsEmailNotifications: user.wantsEmailNotifications,
					wantsMobileNotifications: user.wantsMobileNotifications,
				});
			}
			throw new Error(`Environment variable for JWT secret required`);
		}

		console.log(`Invalid credentials`);
		return sendErrorResponse({ message: "Invalid credentials" });
	} catch (error) {
		console.error(error);
		return sendErrorResponse({ message: "Failed to log in user" });
	}
};
