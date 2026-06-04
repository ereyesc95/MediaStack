<%@ Page Title="Home Page" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Default.aspx.cs" Inherits="MediaBinger._Default" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">

    <div id="login"  class="bck-wrapper" style="background-color: rgba(18, 18, 18, 0.9); padding: 10px; border-radius: 20px">
        <div class="header" style="margin-bottom:30px">
            <p id="appName" style="font-size: 39px; text-decoration: none; color: aliceblue">
                <img src="/Images/System/logo.png" style="width: 39px; margin-top: -3px" />
                <label id="menuType" class="titleLink" style="font-family: 'Times New Roman', Times, serif"><i>Media</i></label><label id="bingerName" class="titleLink">Binger</label>
            </p>
            <h1 style="font-size: 16px; float: right; margin-right: 3px; margin-top: -25px; color:#C6C2C6">Browse. Enjoy. Repeat.</h1>
        </div>
        <form action="javascript:void(0);" method="get">
            <div class="custom-control custom-switch" style="cursor: pointer; display: none">
                <input type="checkbox" class="custom-control-input" id="slideButton" runat="server" />
                <label class="custom-control-label" for="slideButton">Toggle</label>
            </div>
            <fieldset>
                <p>
                    <input id="usrName" name="usrName" type="text" required value="Username" onblur="if(this.value=='')this.value='Username'" onfocus="if(this.value=='Username')this.value='' ">
                </p>
                <p>
                    <input id="usrPassword" name="usrPassword" type="password" class='userPass' required value="Password" onblur="if(this.value=='')this.value='Password'" onfocus="if(this.value=='Password')this.value='' ">
                </p>
                <p>
                    <a href="#" style="float: left; margin-left: 3px; margin-top: 5px; color:aliceblue">Forgot Password?</a>
                    <a href="#" id="registryButton" data-toggle="modal" data-target="#userModal" style="float: right; margin-right: 3px; margin-top: 5px; color:aliceblue">Create account</a>
                </p>
                <br />
                    <div style="margin-top:5px">
                        <asp:Button ID="loginButton" CssClass="logButton" runat="server" Text="Login" OnClick="submit_Click" />

                    </div>

            </fieldset>
        </form>
    </div>
    <div class="body-background"></div>
    <div id="userModal" class="modal fade bd-example-modal-lg">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content rounded-5">
                <iframe id="userRegModal" src="/Forms/UserRegistry.aspx" scrolling="no" style="height: 530px; border: none; border-radius: 10px"></iframe>
            </div>
        </div>
    </div>
    <!-- end login -->

    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prefixfree/1.0.7/prefixfree.min.js"></script>
    <script src="https://s.codepen.io/assets/libs/modernizr.js" type="text/javascript"></script>

    <script src="/JS/Registry.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>
    <script src="/JS/BackHome.js" type="text/javascript"></script>

</asp:Content>
