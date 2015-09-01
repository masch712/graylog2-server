'use strict';

var React = require('react');

var UsersStore = require('../../stores/users/UsersStore').UsersStore;
var RolesStore = require('../../stores/users/RolesStore').RolesStore;
var DataTable = require('../common/DataTable');

var Input = require('react-bootstrap').Input;

var PermissionsMixin = require('../../util/PermissionsMixin');

var UserList = React.createClass({
    mixins: [PermissionsMixin],

    getInitialState() {
        return {
            currentUsername: this.props.currentUsername,
            currentUser: null,
            users: [],
            roles: []
        };
    },
    componentDidMount() {
        this.loadUsers();
        RolesStore.loadRoles().done((roles) => {this.setState({roles: roles.map(role => role.name)})});
    },
    loadUsers: function () {
        var promise = UsersStore.loadUsers();
        promise.done((users) => {
            var currentUser = users.filter((user) => user.username === this.state.currentUsername)[0];
            this.setState({
                currentUser: currentUser,
                users: users
            });
        });
    },
    _hasAdminRole(user) {
        return this.isPermitted(user.permissions, ["*"]);
    },
    deleteUser(username) {
        var promise = UsersStore.deleteUser(username);

        promise.done(() => {
            this.loadUsers();
        });
    },
    _deleteUserFunction(username) {
        return () => {
            if (window.confirm("Do you really want to delete user " + username + "?")) {
                this.deleteUser(username);
            }
        };
    },
    _headerCellFormatter(header) {
        var formattedHeaderCell;

        switch (header.toLocaleLowerCase()) {
            case '':
                formattedHeaderCell = <th className="user-type">{header}</th>;
                break;
            case 'actions':
                formattedHeaderCell = <th className="actions">{header}</th>;
                break;
            default:
                formattedHeaderCell = <th>{header}</th>;
        }

        return formattedHeaderCell;
    },
    _userInfoFormatter(user) {
        var rowClass = user.username === this.state.currentUsername ? "active" : null;
        var userBadge = null;
        if (user.read_only) {
            userBadge = <span><i title="System User" className="fa fa-lock"></i></span>;
        }
        if (user.external) {
            userBadge = <span><i title="LDAP User" className="fa fa-cloud"></i></span>;
        }

        var roleBadges = user.roles.map((role) => <span key={role} className={`label label-${role === 'Admin' ? 'info' : 'default'}`} style={{marginRight: 5}}>{role}</span>);

        var actions = null;
        if (!user.read_only) {
            var deleteAction = (
                <button id="delete-user" type="button" className="btn btn-xs btn-primary" title="Delete user"
                        onClick={this._deleteUserFunction(user.username)}>
                    Delete
                </button>
            );

            var editAction = (
                <a id="edit-user" href={UsersStore.editUserFormUrl(user.username)}
                   className="btn btn-info btn-xs" title={"Edit user " + user.username}>
                    Edit
                </a>
            );

            actions = (
                <div>
                    {this.isPermitted(this.state.currentUser.permissions, ["users:edit"]) ? deleteAction : null}
                    &nbsp;
                    {this.isPermitted(this.state.currentUser.permissions, ["users:edit:" + user.username]) ? editAction : null}
                </div>
            );
        }

        return (
            <tr key={user.username} className={rowClass}>
                <td className="centered">{userBadge}</td>
                <td className="limited">{user.full_name}</td>
                <td className="limited">{user.username}</td>
                <td className="limited">{user.email}</td>
                <td>{roleBadges}</td>
                <td>{actions}</td>
            </tr>
        );
    },
    render() {
        var filterKeys = ["username", "full_name", "email"];
        var headers = ["", "Name", "Username", "Email Address", "Role", "Actions"];

        return (
            <div>
                <DataTable id="user-list"
                           className="table-hover"
                           headers={headers}
                           headerCellFormatter={this._headerCellFormatter}
                           sortByKey={"full_name"}
                           rows={this.state.users}
                           filterBy="role"
                           filterSuggestions={this.state.roles}
                           dataRowFormatter={this._userInfoFormatter}
                           filterLabel="Filter Users"
                           filterKeys={filterKeys}/>
            </div>
        );
    }
});

module.exports = UserList;