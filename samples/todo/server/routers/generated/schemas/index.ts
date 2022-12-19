import { SpaceSchema } from './Space.schema';
import { SpaceUserSchema } from './SpaceUser.schema';
import { UserSchema } from './User.schema';
import { ListSchema } from './List.schema';
import { TodoSchema } from './Todo.schema';
import { AccountSchema } from './Account.schema';

const schemas = {
  Space: SpaceSchema,
  SpaceUser: SpaceUserSchema,
  User: UserSchema,
  List: ListSchema,
  Todo: TodoSchema,
  Account: AccountSchema,
};

export default schemas;
